import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { eq, and, sql, asc, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { learningEvents } from '../../database/schema/telemetry';
import { courses } from '../../database/schema/courses';
import { lessons } from '../../database/schema/lessons';
import { enrollments } from '../../database/schema/enrollments';
import { TelemetryPrivacyService } from './telemetry-privacy.service';
import { TelemetryEventDto } from './dto/telemetry.dto';
import { ApiException } from '../../common/errors/api-error';
import { env } from '../../config/env.config';

export interface TelemetryUserContext {
  id: string;
  role: string;
}

export interface IngestionResult {
  ingestedCount: number;
  deduplicatedCount: number;
  message?: string;
}

export interface PruneResult {
  deletedCount: number;
  batchesProcessed: number;
  completed: boolean;
  skipped?: boolean;
  reason?: string;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  // Per-user/per-lesson sliding window rate limit store: Map<"userId:targetId", timestamps[]>
  private rateLimitStore = new Map<string, number[]>();

  // In-memory override for TELEMETRY_ENABLED kill switch (useful for tests)
  private telemetryEnabledOverride: boolean | null = null;

  // Tracks active pruning run to prevent overlapping executions
  private isPruningActive = false;

  /**
   * Checks whether a pruning run is currently active.
   */
  public isPruningInProgress(): boolean {
    return this.isPruningActive;
  }

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(TelemetryPrivacyService) private readonly privacyService: TelemetryPrivacyService
  ) {}

  /**
   * Resolves the active state of the TELEMETRY_ENABLED kill switch.
   */
  public isTelemetryEnabled(): boolean {
    if (this.telemetryEnabledOverride !== null) {
      return this.telemetryEnabledOverride;
    }
    if (process.env.TELEMETRY_ENABLED !== undefined) {
      return process.env.TELEMETRY_ENABLED === 'true';
    }
    return env.TELEMETRY_ENABLED;
  }

  /**
   * Overrides the kill switch state (for test automation).
   */
  public setTelemetryEnabledOverride(enabled: boolean | null): void {
    this.telemetryEnabledOverride = enabled;
  }

  /**
   * Resets rate-limiting sliding windows (for test automation).
   */
  public resetRateLimits(): void {
    this.rateLimitStore.clear();
  }

  /**
   * Enforces server-side rate-limiting: maximum 2 batch requests per 60s per (userId, lessonId/courseId).
   * AC-P7-01-SEC-03: Exceeding 2 batch requests in 60s returns HTTP 429 Too Many Requests.
   */
  private checkRateLimit(userId: string, targetId: string): void {
    const key = `${userId}:${targetId}`;
    const now = Date.now();
    const windowMs = 60 * 1000; // 60 seconds
    const maxRequests = 2; // Maximum 2 requests per 60 seconds

    let timestamps = this.rateLimitStore.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
      throw new ApiException(
        'Rate limit exceeded: Maximum 2 telemetry requests per 60 seconds for this lesson',
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    timestamps.push(now);
    this.rateLimitStore.set(key, timestamps);
  }

  /**
   * Verifies that the authenticated user possesses active course enrollment or institutional access.
   * AC-P7-01-SEC-06: Submissions lacking active enrollment/entitlement return HTTP 403 Forbidden.
   */
  private async verifyCourseAccess(courseId: string, user: TelemetryUserContext): Promise<void> {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    // Admins and owning instructors have institutional access
    if (user.role === 'admin' || (user.role === 'instructor' && course.instructorId === user.id)) {
      return;
    }

    // Students / learner instructors must possess an active or completed enrollment
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, user.id),
          eq(enrollments.courseId, courseId),
          sql`${enrollments.status} IN ('ACTIVE', 'COMPLETED')`
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Access denied: Active course enrollment required',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }
  }

  /**
   * Core telemetry batch ingestion pipeline.
   * Strictly adheres to ADR-P7-001 and WP-P7-01 acceptance criteria.
   */
  public async ingestBatch(
    events: TelemetryEventDto[],
    user: TelemetryUserContext,
    rawPayloadBytes?: number
  ): Promise<IngestionResult> {
    // 1. Kill Switch Check (TELEMETRY_ENABLED=false)
    if (!this.isTelemetryEnabled()) {
      return {
        ingestedCount: 0,
        deduplicatedCount: 0,
        message: 'Telemetry collection is currently disabled',
      };
    }

    // 2. Payload size ceiling: maximum 32KB (AC-P7-01-SEC-07)
    if (rawPayloadBytes !== undefined && rawPayloadBytes > 32 * 1024) {
      throw new ApiException(
        'Batch payload exceeds maximum size of 32KB',
        HttpStatus.BAD_REQUEST,
        'PAYLOAD_TOO_LARGE'
      );
    }

    // 3. Batch event count ceiling: 1 to 50 events (AC-P7-01-SEC-07)
    if (!events || events.length === 0 || events.length > 50) {
      throw new ApiException(
        'Batch payload must contain between 1 and 50 events',
        HttpStatus.BAD_REQUEST,
        'BATCH_SIZE_EXCEEDED'
      );
    }

    // 4. Rate-limiting check per (userId, lessonId || courseId) (AC-P7-01-SEC-03)
    const targetKeys = new Set<string>();
    for (const event of events) {
      targetKeys.add(event.lessonId || event.courseId);
    }
    for (const targetKey of targetKeys) {
      this.checkRateLimit(user.id, targetKey);
    }

    // 5. Enrollment & Entitlement Authorization (AC-P7-01-SEC-06)
    const uniqueCourseIds = Array.from(new Set(events.map((e) => e.courseId)));
    for (const courseId of uniqueCourseIds) {
      await this.verifyCourseAccess(courseId, user);
    }

    const now = Date.now();
    const toInsert: Array<{
      id: string;
      userId: string;
      courseId: string;
      moduleId: string | null;
      lessonId: string | null;
      eventType: string;
      metadata: Record<string, unknown> | null;
      occurredAt: Date;
    }> = [];

    let deduplicatedCount = 0;

    // Cache lesson durations to minimize database lookups within a single batch
    const lessonDurationCache = new Map<string, number>();

    for (const event of events) {
      // 6. Temporal Bounding: not > 30s in future, not > 24 hours in past (AC-P7-01-SEC-04)
      const eventTime = new Date(event.occurredAt).getTime();
      if (isNaN(eventTime)) {
        throw new ApiException(
          'Invalid occurredAt timestamp',
          HttpStatus.BAD_REQUEST,
          'INVALID_TIMESTAMP'
        );
      }
      if (eventTime > now + 30 * 1000) {
        throw new ApiException(
          'Event occurredAt cannot be more than 30 seconds in the future',
          HttpStatus.BAD_REQUEST,
          'TEMPORAL_BOUND_FUTURE'
        );
      }
      if (eventTime < now - 24 * 60 * 60 * 1000) {
        throw new ApiException(
          'Event occurredAt cannot be older than 24 hours',
          HttpStatus.BAD_REQUEST,
          'TEMPORAL_BOUND_PAST'
        );
      }

      // 7. Duration Cap: watchPositionSeconds and previousPositionSeconds cannot exceed verified lesson duration (AC-P7-01-SEC-05)
      if (
        event.lessonId &&
        (event.metadata?.watchPositionSeconds !== undefined ||
          event.metadata?.previousPositionSeconds !== undefined)
      ) {
        let lessonDuration = lessonDurationCache.get(event.lessonId);
        if (lessonDuration === undefined) {
          const [lesson] = await this.db
            .select({ durationSeconds: lessons.durationSeconds })
            .from(lessons)
            .where(eq(lessons.id, event.lessonId))
            .limit(1);

          if (!lesson) {
            throw new ApiException('Lesson not found', HttpStatus.NOT_FOUND, 'LESSON_NOT_FOUND');
          }
          lessonDuration = lesson.durationSeconds;
          lessonDurationCache.set(event.lessonId, lessonDuration);
        }

        if (
          event.metadata?.watchPositionSeconds !== undefined &&
          lessonDuration > 0 &&
          event.metadata.watchPositionSeconds > lessonDuration
        ) {
          throw new ApiException(
            'watchPositionSeconds exceeds verified lesson video duration',
            HttpStatus.BAD_REQUEST,
            'WATCH_POSITION_EXCEEDS_DURATION'
          );
        }

        if (
          event.metadata?.previousPositionSeconds !== undefined &&
          lessonDuration > 0 &&
          event.metadata.previousPositionSeconds > lessonDuration
        ) {
          throw new ApiException(
            'previousPositionSeconds exceeds verified lesson video duration',
            HttpStatus.BAD_REQUEST,
            'PREVIOUS_POSITION_EXCEEDS_DURATION'
          );
        }
      }

      // 8. Rotating daily salt pseudonymous hashing (Fail-Closed)
      let hashedUserId: string;
      try {
        hashedUserId = this.privacyService.hashIdentifier(user.id, new Date(event.occurredAt));
      } catch (err) {
        this.logger.error('Failed to hash telemetry identifier: fail-closed triggered', err);
        throw new ApiException(
          'Telemetry service temporarily unavailable',
          HttpStatus.INTERNAL_SERVER_ERROR,
          'TELEMETRY_SALT_UNAVAILABLE'
        );
      }

      // 9. Duplicate-Event Idempotency & Conflict Check (AC-P7-01-SEC-01 & AC-P7-01-SEC-02)
      const existing = await this.db
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, event.eventId))
        .limit(1);

      if (existing.length > 0) {
        const record = existing[0];
        const isSamePayload =
          record.courseId === event.courseId &&
          record.userId === hashedUserId &&
          (record.moduleId || null) === (event.moduleId || null) &&
          (record.lessonId || null) === (event.lessonId || null) &&
          record.eventType === event.eventType &&
          new Date(record.occurredAt).getTime() === eventTime &&
          JSON.stringify(record.metadata || null) === JSON.stringify(event.metadata || null);

        if (isSamePayload) {
          // Exact duplicate: idempotent ignore (AC-P7-01-SEC-01)
          deduplicatedCount++;
          continue;
        } else {
          // Altered payload with existing event ID: conflict (AC-P7-01-SEC-02)
          throw new ApiException(
            `Idempotency conflict: Event with ID ${event.eventId} already exists with differing attributes`,
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_CONFLICT'
          );
        }
      }

      toInsert.push({
        id: event.eventId,
        userId: hashedUserId,
        courseId: event.courseId,
        moduleId: event.moduleId || null,
        lessonId: event.lessonId || null,
        eventType: event.eventType,
        metadata: event.metadata || null,
        occurredAt: new Date(event.occurredAt),
      });
    }

    // 10. Atomic Multi-Row Insert (Option A)
    if (toInsert.length > 0) {
      await this.db.insert(learningEvents).values(toInsert);
    }

    return {
      ingestedCount: toInsert.length,
      deduplicatedCount,
      message: 'Telemetry events processed successfully',
    };
  }

  /**
   * Scheduled 90-day chunked pruning of high-frequency VIDEO_CHECKPOINT records.
   * Milestone events (COURSE_OPENED, LESSON_COMPLETED, QUIZ_ATTEMPTED, etc.) are permanently retained.
   *
   * Operates in discrete, bounded batches (default 5,000 rows) releasing database locks
   * between iterations to avoid lock escalation on constrained PostgreSQL tiers.
   */
  public async pruneOldCheckpoints(olderThanDays = 90, batchSize = 5000): Promise<PruneResult> {
    // 1. Kill Switch Check (immediate return if telemetry is disabled)
    if (!this.isTelemetryEnabled()) {
      this.logger.log('Pruning aborted: TELEMETRY_ENABLED is false');
      return {
        deletedCount: 0,
        batchesProcessed: 0,
        completed: true,
        skipped: true,
        reason: 'TELEMETRY_DISABLED',
      };
    }

    // 2. Concurrency Guard: Prevent overlapping runs within single-instance process
    if (this.isPruningActive) {
      this.logger.warn('Pruning run skipped: Another pruning execution is already in progress');
      return {
        deletedCount: 0,
        batchesProcessed: 0,
        completed: false,
        skipped: true,
        reason: 'ALREADY_IN_PROGRESS',
      };
    }

    this.isPruningActive = true;
    const effectiveBatchSize = Math.max(1, batchSize);
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    let totalDeleted = 0;
    let batchesProcessed = 0;

    try {
      while (true) {
        // 3. Re-check kill switch before each batch to support runtime configuration changes
        if (!this.isTelemetryEnabled()) {
          this.logger.warn(
            `Pruning interrupted: TELEMETRY_ENABLED disabled after processing ${batchesProcessed} batches (${totalDeleted} records)`
          );
          return {
            deletedCount: totalDeleted,
            batchesProcessed,
            completed: false,
            skipped: true,
            reason: 'TELEMETRY_DISABLED',
          };
        }

        // 4. Deterministically select up to effectiveBatchSize IDs using (occurred_at, id)
        const candidateRows = await this.db
          .select({ id: learningEvents.id })
          .from(learningEvents)
          .where(
            and(
              eq(learningEvents.eventType, 'VIDEO_CHECKPOINT'),
              sql`${learningEvents.occurredAt} < ${cutoffDate}`
            )
          )
          .orderBy(asc(learningEvents.occurredAt), asc(learningEvents.id))
          .limit(effectiveBatchSize);

        if (candidateRows.length === 0) {
          break;
        }

        const batchIds = candidateRows.map((r) => r.id);

        // 5. Execute batch deletion in separate statement so row/table locks are released between batches
        await this.db.delete(learningEvents).where(inArray(learningEvents.id, batchIds));

        totalDeleted += batchIds.length;
        batchesProcessed++;

        this.logger.log(
          `Pruned batch ${batchesProcessed}: deleted ${batchIds.length} VIDEO_CHECKPOINT records (total: ${totalDeleted})`
        );

        // If fewer rows than effectiveBatchSize were returned, all eligible records have been pruned
        if (batchIds.length < effectiveBatchSize) {
          break;
        }
      }

      this.logger.log(
        `Completed 90-day retention pruning: ${totalDeleted} records removed across ${batchesProcessed} batches`
      );

      return {
        deletedCount: totalDeleted,
        batchesProcessed,
        completed: true,
      };
    } catch (err) {
      this.logger.error(
        `Pruning failed during batch ${batchesProcessed + 1} after deleting ${totalDeleted} records: ${(err as Error).message}`,
        err
      );
      throw err;
    } finally {
      this.isPruningActive = false;
    }
  }
}
