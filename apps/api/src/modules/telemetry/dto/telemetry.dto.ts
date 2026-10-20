import { z } from 'zod';

export const approvedEventTypeEnum = z.enum([
  'COURSE_OPENED',
  'LESSON_STARTED',
  'VIDEO_STARTED',
  'VIDEO_PAUSED',
  'VIDEO_SEEKED',
  'VIDEO_CHECKPOINT',
  'VIDEO_COMPLETED',
  'LESSON_COMPLETED',
  'QUIZ_ATTEMPTED',
  'CERTIFICATE_EARNED',
]);

export type ApprovedEventType = z.infer<typeof approvedEventTypeEnum>;

/**
 * Strict allowlist for telemetry event metadata.
 * Prohibits raw search queries, user search strings, free-form text, PII, device fingerprints, or IP addresses.
 * .strict() ensures any unapproved field causes immediate validation failure.
 */
export const telemetryMetadataSchema = z
  .object({
    watchPositionSeconds: z.number().nonnegative().max(86400).optional(),
    previousPositionSeconds: z.number().nonnegative().max(86400).optional(),
    totalDurationSeconds: z.number().nonnegative().max(86400).optional(),
    playbackRate: z.number().min(0.1).max(5.0).optional(),
    score: z.number().min(0).max(100).optional(),
    passed: z.boolean().optional(),
    checkpointIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

export type TelemetryMetadataDto = z.infer<typeof telemetryMetadataSchema>;

/**
 * Single learning telemetry event schema.
 * Strict field allowlisting at the boundary.
 */
export const telemetryEventSchema = z
  .object({
    eventId: z.string().uuid({ message: 'eventId must be a valid UUID' }),
    courseId: z.string().uuid({ message: 'courseId must be a valid UUID' }),
    moduleId: z.string().uuid({ message: 'moduleId must be a valid UUID' }).optional().nullable(),
    lessonId: z.string().uuid({ message: 'lessonId must be a valid UUID' }).optional().nullable(),
    eventType: approvedEventTypeEnum,
    metadata: telemetryMetadataSchema.optional().nullable(),
    occurredAt: z.string().datetime({ message: 'occurredAt must be a valid ISO 8601 datetime string' }),
    sessionId: z.string().max(64).optional().nullable(),
  })
  .strict();

export type TelemetryEventDto = z.infer<typeof telemetryEventSchema>;

/**
 * Batch payload schema for POST /api/v1/learning/events
 * Enforces maximum 50 events per batch (AC-P7-01-SEC-07).
 */
export const ingestTelemetryBatchSchema = z
  .object({
    events: z
      .array(telemetryEventSchema)
      .min(1, 'Batch must contain at least 1 event')
      .max(50, 'Batch payload exceeds maximum ceiling of 50 events'),
  })
  .strict();

export type IngestTelemetryBatchDto = z.infer<typeof ingestTelemetryBatchSchema>;
