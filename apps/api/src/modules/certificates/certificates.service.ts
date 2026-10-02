import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import { eq, and, count, inArray, or, ilike, desc } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  certificates,
  enrollments,
  courses,
  users,
  modules,
  lessons,
  lessonProgress,
  quizzes,
  quizAttempts,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { AdminQueryCertificatesDto } from './dto/query-certificates.dto';
import { mapToAdminCertificateDto } from './dto/certificate.dto';

/**
 * Frozen unambiguous character set for certificate numbers
 * Excludes confusing glyphs (0/O, 1/I/l)
 */
export const CERTIFICATE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an unambiguous, cryptographically secure certificate verification number
 * Format: TSP-YYYY-CXXXXXXXX (e.g., TSP-2026-CK7M9X2P)
 */
export function generateCertificateNumber(year: number = new Date().getFullYear()): string {
  let token = '';
  for (let i = 0; i < 8; i++) {
    const idx = randomInt(0, CERTIFICATE_ALPHABET.length);
    token += CERTIFICATE_ALPHABET[idx];
  }
  return `TSP-${year}-C${token}`;
}

export interface CertificateIssuanceContext {
  actorId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export type IssueCertificateResult =
  | {
      status: 'ISSUED';
      issued: true;
      certificate: typeof certificates.$inferSelect;
    }
  | {
      status: 'ALREADY_EXISTS';
      issued: false;
      certificate: typeof certificates.$inferSelect;
    }
  | {
      status: 'NOT_ELIGIBLE';
      issued: false;
      reason: string;
      details?: Record<string, unknown>;
    }
  | {
      status: 'ENROLLMENT_NOT_FOUND';
      issued: false;
      reason: string;
    }
  | {
      status: 'INVALID_DOMAIN_STATE';
      issued: false;
      reason: string;
    };

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
  totalLessons: number;
  completedLessons: number;
  publishedQuizzes: number;
  passedQuizzes: number;
  hasUnpassedQuizzes: boolean;
  hasUnpassedFinalExam: boolean;
  isCourseCompleted: boolean;
}

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Central authority for certificate evaluation and automated issuance.
   * Guarantees idempotency, immutability, and duplicate prevention.
   */
  async issueCertificateIfEligible(
    enrollmentId: string,
    context?: CertificateIssuanceContext
  ): Promise<IssueCertificateResult> {
    // 1. Check if a certificate already exists (Historical Invariant: never reissue or mutate)
    const [existingCert] = await this.db
      .select()
      .from(certificates)
      .where(eq(certificates.enrollmentId, enrollmentId))
      .limit(1);

    if (existingCert) {
      return {
        status: 'ALREADY_EXISTS',
        issued: false,
        certificate: existingCert,
      };
    }

    // 2. Load enrollment
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      return {
        status: 'ENROLLMENT_NOT_FOUND',
        issued: false,
        reason: `Enrollment ${enrollmentId} not found`,
      };
    }

    // 3. Load course context
    const [course] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, enrollment.courseId))
      .limit(1);

    if (!course) {
      return {
        status: 'INVALID_DOMAIN_STATE',
        issued: false,
        reason: `Course ${enrollment.courseId} not found for enrollment ${enrollmentId}`,
      };
    }

    // 4. Verify enrollment completion state
    if (enrollment.status !== 'COMPLETED' || !enrollment.completedAt) {
      return {
        status: 'NOT_ELIGIBLE',
        issued: false,
        reason: 'Enrollment status is not COMPLETED or completedAt is missing',
        details: {
          enrollmentStatus: enrollment.status,
          completedAt: enrollment.completedAt,
        },
      };
    }

    // 5. Verify curriculum requirements (lessons and published quizzes)
    const eligibility = await this.checkEligibility(enrollmentId, course.id);
    if (!eligibility.isEligible) {
      return {
        status: 'NOT_ELIGIBLE',
        issued: false,
        reason: eligibility.reason || 'Curriculum completion criteria not satisfied',
        details: {
          totalLessons: eligibility.totalLessons,
          completedLessons: eligibility.completedLessons,
          publishedQuizzes: eligibility.publishedQuizzes,
          passedQuizzes: eligibility.passedQuizzes,
          hasUnpassedQuizzes: eligibility.hasUnpassedQuizzes,
          hasUnpassedFinalExam: eligibility.hasUnpassedFinalExam,
        },
      };
    }

    // 6. Calculate deterministic final score snapshot
    const finalScorePercentage = await this.calculateFinalScore(course.id, enrollmentId);

    // 7. Resolve student display name snapshot
    const [student] = await this.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, enrollment.studentId))
      .limit(1);

    if (!student || !student.name) {
      return {
        status: 'INVALID_DOMAIN_STATE',
        issued: false,
        reason: `Student user record or name not found for ID ${enrollment.studentId}`,
      };
    }

    // 8. Resolve instructor of record display name snapshot
    const [instructor] = await this.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, course.instructorId))
      .limit(1);

    if (!instructor || !instructor.name) {
      return {
        status: 'INVALID_DOMAIN_STATE',
        issued: false,
        reason: `Course instructor of record not found for user ID ${course.instructorId}`,
      };
    }

    // 9. Atomic insertion with unique collision retry & race condition protection
    const issuedAt = new Date();
    let createdCert: typeof certificates.$inferSelect | null = null;
    let retriesLeft = 5;

    while (retriesLeft > 0 && !createdCert) {
      retriesLeft--;
      const certificateNumber = generateCertificateNumber(issuedAt.getFullYear());

      try {
        const [inserted] = await this.db
          .insert(certificates)
          .values({
            certificateNumber,
            enrollmentId,
            courseId: course.id,
            studentId: enrollment.studentId,
            studentName: student.name,
            courseTitle: course.title,
            instructorName: instructor.name,
            completedAt: enrollment.completedAt,
            issuedAt,
            finalScorePercentage,
            status: 'ACTIVE',
          })
          .returning();

        createdCert = inserted;
      } catch (err: any) {
        const msg = String(err?.message || '');
        const detail = String(err?.detail || '');

        // Check for enrollment_id unique collision (concurrent race)
        const isEnrollmentCollision =
          msg.includes('(enrollment_id)=') ||
          detail.includes('(enrollment_id)=') ||
          msg.includes('certificates_enrollment_id_uq') ||
          detail.includes('certificates_enrollment_id_uq');

        if (isEnrollmentCollision) {
          const [existing] = await this.db
            .select()
            .from(certificates)
            .where(eq(certificates.enrollmentId, enrollmentId))
            .limit(1);

          if (existing) {
            return {
              status: 'ALREADY_EXISTS',
              issued: false,
              certificate: existing,
            };
          }
        }

        // Check for certificate_number unique collision (retry with fresh token)
        const isCertNumberCollision =
          msg.includes('(certificate_number)=') ||
          detail.includes('(certificate_number)=') ||
          msg.includes('certificates_number_uq') ||
          detail.includes('certificates_number_uq') ||
          msg.includes('certificates_certificate_number_key');

        if (isCertNumberCollision) {
          this.logger.warn(`Certificate number collision detected for ${certificateNumber}. Retrying...`);
          continue;
        }

        throw err;
      }
    }

    if (!createdCert) {
      throw new Error('Failed to generate a unique certificate number after maximum retries');
    }

    // 10. Emit CERTIFICATE_ISSUED audit event ONLY on successful fresh issuance
    await this.auditService.record({
      actorId: context?.actorId || enrollment.studentId,
      action: 'CERTIFICATE_ISSUED',
      targetType: 'CERTIFICATE',
      targetId: createdCert.id,
      ipAddress: context?.ipAddress || null,
      userAgent: context?.userAgent || null,
      requestId: context?.requestId || null,
      metadata: {
        certificateId: createdCert.id,
        certificateNumber: createdCert.certificateNumber,
        enrollmentId: createdCert.enrollmentId,
        courseId: createdCert.courseId,
        studentId: createdCert.studentId,
        studentName: createdCert.studentName,
        courseTitle: createdCert.courseTitle,
        instructorName: createdCert.instructorName,
        finalScorePercentage: createdCert.finalScorePercentage,
        completedAt: createdCert.completedAt ? createdCert.completedAt.toISOString() : null,
        issuedAt: createdCert.issuedAt ? createdCert.issuedAt.toISOString() : null,
      },
    });

    this.logger.log(
      `Certificate ${createdCert.certificateNumber} successfully issued for enrollment ${enrollmentId}`
    );

    return {
      status: 'ISSUED',
      issued: true,
      certificate: createdCert,
    };
  }

  /**
   * Deterministic evaluation of curriculum completion criteria
   */
  async checkEligibility(enrollmentId: string, courseId: string): Promise<EligibilityResult> {
    // 1. Total lessons in course
    const [totalLessonsRes] = await this.db
      .select({ count: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));
    const totalLessons = Number(totalLessonsRes?.count || 0);

    // 2. Completed lessons for enrollment
    const [completedLessonsRes] = await this.db
      .select({ count: count(lessonProgress.id) })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(lessonProgress.enrollmentId, enrollmentId),
          eq(modules.courseId, courseId),
          eq(lessonProgress.status, 'COMPLETED')
        )
      );
    const completedLessons = Number(completedLessonsRes?.count || 0);

    // 3. Published quizzes in course (DRAFT and ARCHIVED excluded)
    const publishedQuizzesList = await this.db
      .select({
        id: quizzes.id,
        quizType: quizzes.quizType,
      })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED')
        )
      );
    const publishedQuizzes = publishedQuizzesList.length;

    // 4. Passed attempts for published quizzes
    const publishedQuizIds = publishedQuizzesList.map((q) => q.id);
    let passedQuizIdSet = new Set<string>();

    if (publishedQuizIds.length > 0) {
      const passedAttempts = await this.db
        .select({ quizId: quizAttempts.quizId })
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.enrollmentId, enrollmentId),
            inArray(quizAttempts.quizId, publishedQuizIds),
            eq(quizAttempts.status, 'SUBMITTED'),
            eq(quizAttempts.isPassed, true)
          )
        )
        .groupBy(quizAttempts.quizId);

      passedQuizIdSet = new Set(passedAttempts.map((a) => a.quizId));
    }

    const passedQuizzes = passedQuizIdSet.size;
    const hasUnpassedQuizzes = publishedQuizzesList.some((q) => !passedQuizIdSet.has(q.id));

    // 5. Final Exam requirement (if published FINAL_EXAM exists, it must be passed)
    const finalExams = publishedQuizzesList.filter((q) => q.quizType === 'FINAL_EXAM');
    const hasUnpassedFinalExam = finalExams.some((fe) => !passedQuizIdSet.has(fe.id));

    // 6. Overall completion
    const totalItems = totalLessons + publishedQuizzes;
    const completedItems = completedLessons + passedQuizzes;
    const isCourseCompleted = totalItems > 0 && completedItems === totalItems;

    let reason: string | undefined;
    if (totalItems === 0) {
      reason = 'Course contains no curriculum items';
    } else if (completedLessons < totalLessons) {
      reason = `Incomplete lessons: ${completedLessons} of ${totalLessons} completed`;
    } else if (hasUnpassedQuizzes) {
      reason = `Incomplete quizzes: ${passedQuizzes} of ${publishedQuizzes} published quizzes passed`;
    } else if (hasUnpassedFinalExam) {
      reason = 'Published final examination has not been passed';
    }

    return {
      isEligible: isCourseCompleted && !hasUnpassedQuizzes && !hasUnpassedFinalExam,
      reason,
      totalLessons,
      completedLessons,
      publishedQuizzes,
      passedQuizzes,
      hasUnpassedQuizzes,
      hasUnpassedFinalExam,
      isCourseCompleted,
    };
  }

  /**
   * Authoritative calculation of finalScorePercentage
   * Rule A: If published FINAL_EXAM exists -> highest passed percentage among passed final-exam attempts
   * Rule B: If no FINAL_EXAM but published quizzes exist -> unweighted arithmetic mean of best passed percentages across published quizzes, rounded
   * Rule C: If zero quizzes exist -> 100
   */
  async calculateFinalScore(courseId: string, enrollmentId: string): Promise<number> {
    // Load all published quizzes in course
    const publishedQuizzesList = await this.db
      .select({
        id: quizzes.id,
        quizType: quizzes.quizType,
      })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED')
        )
      );

    // Rule C: Zero quizzes -> 100%
    if (publishedQuizzesList.length === 0) {
      return 100;
    }

    const publishedQuizIds = publishedQuizzesList.map((q) => q.id);

    // Load all passed submitted attempts for these published quizzes
    const passedAttempts = await this.db
      .select({
        quizId: quizAttempts.quizId,
        percentage: quizAttempts.percentage,
      })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.enrollmentId, enrollmentId),
          inArray(quizAttempts.quizId, publishedQuizIds),
          eq(quizAttempts.status, 'SUBMITTED'),
          eq(quizAttempts.isPassed, true)
        )
      );

    // Check for published FINAL_EXAM
    const finalExamQuizzes = publishedQuizzesList.filter((q) => q.quizType === 'FINAL_EXAM');

    if (finalExamQuizzes.length > 0) {
      // Rule A: Highest passed percentage among passed final exam attempts
      const finalExamIds = new Set(finalExamQuizzes.map((fe) => fe.id));
      const finalExamPassedAttempts = passedAttempts.filter((a) => finalExamIds.has(a.quizId));

      if (finalExamPassedAttempts.length > 0) {
        const percentages = finalExamPassedAttempts.map((a) => Number(a.percentage));
        const maxScore = Math.max(...percentages);
        return Math.min(100, Math.max(0, Math.round(maxScore)));
      }
    }

    // Rule B: Unweighted arithmetic mean across all published quizzes
    let totalScoreSum = 0;

    for (const quiz of publishedQuizzesList) {
      const attemptsForQuiz = passedAttempts.filter((a) => a.quizId === quiz.id);
      if (attemptsForQuiz.length > 0) {
        const bestQuizScore = Math.max(...attemptsForQuiz.map((a) => Number(a.percentage)));
        totalScoreSum += bestQuizScore;
      }
    }

    const mean = totalScoreSum / publishedQuizzesList.length;
    return Math.min(100, Math.max(0, Math.round(mean)));
  }

  /**
   * Helper: Retrieve certificate by enrollment ID
   */
  async getCertificateByEnrollment(enrollmentId: string) {
    const [cert] = await this.db
      .select()
      .from(certificates)
      .where(eq(certificates.enrollmentId, enrollmentId))
      .limit(1);
    return cert || null;
  }

  /**
   * Helper: Retrieve certificate by public verification certificate number
   */
  async getCertificateByNumber(certificateNumber: string) {
    const [cert] = await this.db
      .select()
      .from(certificates)
      .where(eq(certificates.certificateNumber, certificateNumber))
      .limit(1);
    return cert || null;
  }

  /**
   * Helper: Retrieve certificate by primary key ID
   */
  async getCertificateById(id: string) {
    const [cert] = await this.db
      .select()
      .from(certificates)
      .where(eq(certificates.id, id))
      .limit(1);
    return cert || null;
  }

  /**
   * Helper: Retrieve certificate for student in a specific course
   */
  async getCertificateForStudent(courseId: string, studentId: string) {
    const [cert] = await this.db
      .select()
      .from(certificates)
      .where(
        and(
          eq(certificates.courseId, courseId),
          eq(certificates.studentId, studentId)
        )
      )
      .limit(1);
    return cert || null;
  }

  /**
   * Helper: Retrieve student enrollment record for course
   */
  async getEnrollment(courseId: string, studentId: string) {
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, courseId),
          eq(enrollments.studentId, studentId)
        )
      )
      .limit(1);
    return enrollment || null;
  }

  /**
   * Admin: List certificates with pagination, filtering, and search
   */
  async listCertificates(query: AdminQueryCertificatesDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query.status) {
      conditions.push(eq(certificates.status, query.status));
    }

    if (query.courseId) {
      conditions.push(eq(certificates.courseId, query.courseId));
    }

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(certificates.studentName, term),
          ilike(certificates.certificateNumber, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRes] = await this.db
      .select({ count: count(certificates.id) })
      .from(certificates)
      .where(whereClause);

    const total = Number(countRes?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const items = await this.db
      .select()
      .from(certificates)
      .where(whereClause)
      .orderBy(desc(certificates.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: items.map(mapToAdminCertificateDto),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Admin: Revoke an issued certificate
   */
  async revokeCertificate(
    id: string,
    reason: string,
    context?: CertificateIssuanceContext
  ): Promise<typeof certificates.$inferSelect> {
    const cert = await this.getCertificateById(id);
    if (!cert) {
      throw new ApiException(
        'Certificate not found',
        HttpStatus.NOT_FOUND,
        'CERTIFICATE_NOT_FOUND'
      );
    }

    if (cert.status === 'REVOKED') {
      throw new ApiException(
        'Certificate is already revoked',
        HttpStatus.CONFLICT,
        'CERTIFICATE_ALREADY_REVOKED'
      );
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason || trimmedReason.length < 5 || trimmedReason.length > 1000) {
      throw new ApiException(
        'Revocation reason must be between 5 and 1000 characters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR'
      );
    }

    const revokedAt = new Date();
    const updatedAt = new Date();

    const [updated] = await this.db
      .update(certificates)
      .set({
        status: 'REVOKED',
        revokedAt,
        revocationReason: trimmedReason,
        updatedAt,
      })
      .where(eq(certificates.id, id))
      .returning();

    // Emit exactly one CERTIFICATE_REVOKED audit event
    await this.auditService.record({
      actorId: context?.actorId || null,
      action: 'CERTIFICATE_REVOKED',
      targetType: 'CERTIFICATE',
      targetId: updated.id,
      ipAddress: context?.ipAddress || null,
      userAgent: context?.userAgent || null,
      requestId: context?.requestId || null,
      metadata: {
        certificateId: updated.id,
        certificateNumber: updated.certificateNumber,
        enrollmentId: updated.enrollmentId,
        courseId: updated.courseId,
        studentId: updated.studentId,
        revokedAt: revokedAt.toISOString(),
        revocationReason: trimmedReason,
      },
    });

    this.logger.log(
      `Certificate ${updated.certificateNumber} (${updated.id}) administratively revoked`
    );

    return updated;
  }
}


export const CertificatesService = CertificateService;
