import { Injectable, HttpStatus, Inject } from '@nestjs/common';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  courses,
  lessons,
  modules,
  enrollments,
  users,
  userRoles,
  roles,
  assignments,
  assignmentSubmissions,
  assignmentGrades,
  Assignment,
  AssignmentSubmission,
  AssignmentGrade,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { validateAndSanitizeContent } from '../../common/utils/content-sanitizer';
import { AssignmentUploadService } from './assignment-upload.service';
import type {
  CreateAssignmentDto,
  CreateAssignmentInput,
  UpdateAssignmentDto,
  GradeSubmissionDto,
  AssignmentListQuery,
  SubmissionListQuery,
  AssignmentDto,
  AssignmentSubmissionDto,
  AssignmentGradeDto,
  PaginatedAssignmentsDto,
  PaginatedSubmissionsDto,
} from '@techsprout/contracts';

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AssignmentUploadService) private readonly uploadService: AssignmentUploadService
  ) {}

  /**
   * Helper: verify course access for learners and instructors
   */
  async verifyCourseAccess(courseId: string, userId: string) {
    const [course] = await this.db
      .select({ id: courses.id, instructorId: courses.instructorId, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    const [userRecord] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord) {
      throw new ApiException('User not found', HttpStatus.UNAUTHORIZED, 'USER_NOT_FOUND');
    }

    const role = userRecord.role || 'student';
    const user = { ...userRecord, role };
    const isAdmin = role === 'admin';
    const isCourseInstructor = course.instructorId === userId;

    if (isAdmin || isCourseInstructor) {
      return { course, user, isCourseInstructor, isAdmin };
    }

    // Verify enrollment
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, userId),
          eq(enrollments.courseId, courseId),
          sql`${enrollments.status} IN ('ACTIVE', 'COMPLETED')`
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Access denied: You must be enrolled in this course to access assignments',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }

    return { course, user, isCourseInstructor: false, isAdmin: false };
  }

  /**
   * Helper: verify user is course instructor or admin
   */
  async verifyInstructorOrAdmin(courseId: string, userId: string) {
    const [course] = await this.db
      .select({ id: courses.id, instructorId: courses.instructorId })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    const [userRecord] = await this.db
      .select({
        id: users.id,
        name: users.name,
        role: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord) {
      throw new ApiException('User not found', HttpStatus.UNAUTHORIZED, 'USER_NOT_FOUND');
    }

    const isAdmin = userRecord.role === 'admin';
    const isCourseInstructor = course.instructorId === userId;

    if (!isCourseInstructor && !isAdmin) {
      throw new ApiException(
        'Access denied: Only course instructor or administrator can perform this operation',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return { course, user: userRecord, isCourseInstructor, isAdmin };
  }

  /**
   * Create an assignment (Instructor/Admin)
   */
  async createAssignment(
    courseId: string,
    userId: string,
    dto: CreateAssignmentDto | CreateAssignmentInput
  ): Promise<AssignmentDto> {
    await this.verifyInstructorOrAdmin(courseId, userId);

    if (dto.lessonId) {
      const [les] = await this.db
        .select({ id: lessons.id })
        .from(lessons)
        .innerJoin(modules, eq(lessons.moduleId, modules.id))
        .where(and(eq(lessons.id, dto.lessonId), eq(modules.courseId, courseId)))
        .limit(1);

      if (!les) {
        throw new ApiException('Target lesson not found in this course', HttpStatus.BAD_REQUEST, 'INVALID_LESSON');
      }
    }

    const title = validateAndSanitizeContent(dto.title, 'title');
    const description = validateAndSanitizeContent(dto.description, 'description');
    const instructions = dto.instructions ? validateAndSanitizeContent(dto.instructions, 'instructions') : null;

    const [created] = await this.db
      .insert(assignments)
      .values({
        courseId,
        lessonId: dto.lessonId || null,
        title,
        description,
        instructions,
        rubric: dto.rubric as any,
        maxScore: dto.maxScore ?? 100,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.status ?? 'DRAFT',
        allowResubmission: dto.allowResubmission ?? true,
      })
      .returning();

    await this.auditService.record({
      actorId: userId,
      action: 'ASSIGNMENT_CREATED',
      targetType: 'ASSIGNMENT',
      targetId: created.id,
      metadata: { courseId, title },
    });

    return {
      id: created.id,
      courseId: created.courseId,
      lessonId: created.lessonId,
      title: created.title,
      description: created.description,
      instructions: created.instructions,
      rubric: created.rubric as any,
      maxScore: created.maxScore,
      dueDate: created.dueDate?.toISOString() || null,
      status: created.status,
      allowResubmission: created.allowResubmission,
      submissionCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * List assignments in a course
   */
  async listAssignments(
    courseId: string,
    userId: string,
    query: AssignmentListQuery
  ): Promise<PaginatedAssignmentsDto> {
    const { isCourseInstructor, isAdmin } = await this.verifyCourseAccess(courseId, userId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(assignments.courseId, courseId)];

    if (query.lessonId) {
      conditions.push(eq(assignments.lessonId, query.lessonId));
    }

    if (!isCourseInstructor && !isAdmin) {
      // Learners only see PUBLISHED or CLOSED assignments
      conditions.push(inArray(assignments.status, ['PUBLISHED', 'CLOSED']));
    } else if (query.status) {
      conditions.push(eq(assignments.status, query.status));
    }

    const whereClause = and(...conditions);

    const [countRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignments)
      .where(whereClause);

    const total = countRes?.count || 0;

    const rows = await this.db
      .select({
        assignment: assignments,
        submissionCount: sql<number>`(SELECT count(*)::int FROM assignment_submissions WHERE assignment_id = ${assignments.id})`,
      })
      .from(assignments)
      .where(whereClause)
      .orderBy(desc(assignments.createdAt))
      .limit(limit)
      .offset(offset);

    // If student, attach their latest submission for each assignment
    let studentSubmissionsMap = new Map<string, AssignmentSubmissionDto>();
    if (!isCourseInstructor && !isAdmin) {
      const assignmentIds = rows.map((r) => r.assignment.id);
      if (assignmentIds.length > 0) {
        const studentSubs = await this.db
          .select({
            submission: assignmentSubmissions,
            grade: assignmentGrades,
          })
          .from(assignmentSubmissions)
          .leftJoin(assignmentGrades, eq(assignmentSubmissions.id, assignmentGrades.submissionId))
          .where(
            and(
              inArray(assignmentSubmissions.assignmentId, assignmentIds),
              eq(assignmentSubmissions.studentId, userId)
            )
          )
          .orderBy(desc(assignmentSubmissions.version));

        for (const sub of studentSubs) {
          if (!studentSubmissionsMap.has(sub.submission.assignmentId)) {
            studentSubmissionsMap.set(sub.submission.assignmentId, {
              id: sub.submission.id,
              assignmentId: sub.submission.assignmentId,
              studentId: sub.submission.studentId,
              version: sub.submission.version,
              fileUrl: sub.submission.fileUrl,
              fileStorageKey: sub.submission.fileStorageKey,
              originalFilename: sub.submission.originalFilename,
              mimeType: sub.submission.mimeType,
              fileSizeBytes: sub.submission.fileSizeBytes,
              studentNotes: sub.submission.studentNotes,
              status: sub.submission.status,
              grade: sub.grade
                ? {
                    id: sub.grade.id,
                    submissionId: sub.grade.submissionId,
                    graderId: sub.grade.graderId,
                    score: sub.grade.score,
                    maxScore: 100,
                    percentage: sub.grade.score,
                    feedback: sub.grade.feedback,
                    rubricEvaluation: sub.grade.rubricEvaluation as any,
                    gradedAt: sub.grade.gradedAt.toISOString(),
                    updatedAt: sub.grade.updatedAt.toISOString(),
                  }
                : null,
              submittedAt: sub.submission.submittedAt.toISOString(),
              updatedAt: sub.submission.updatedAt.toISOString(),
            });
          }
        }
      }
    }

    const data: AssignmentDto[] = rows.map((r) => ({
      id: r.assignment.id,
      courseId: r.assignment.courseId,
      lessonId: r.assignment.lessonId,
      title: r.assignment.title,
      description: r.assignment.description,
      instructions: r.assignment.instructions,
      rubric: r.assignment.rubric as any,
      maxScore: r.assignment.maxScore,
      dueDate: r.assignment.dueDate?.toISOString() || null,
      status: r.assignment.status,
      allowResubmission: r.assignment.allowResubmission,
      submissionCount: r.submissionCount || 0,
      userSubmission: studentSubmissionsMap.get(r.assignment.id) || null,
      createdAt: r.assignment.createdAt.toISOString(),
      updatedAt: r.assignment.updatedAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single assignment details
   */
  async getAssignment(courseId: string, assignmentId: string, userId: string): Promise<AssignmentDto> {
    const { isCourseInstructor, isAdmin } = await this.verifyCourseAccess(courseId, userId);

    const [row] = await this.db
      .select({
        assignment: assignments,
        submissionCount: sql<number>`(SELECT count(*)::int FROM assignment_submissions WHERE assignment_id = ${assignments.id})`,
      })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!row) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    if (!isCourseInstructor && !isAdmin && row.assignment.status === 'DRAFT') {
      throw new ApiException('Assignment is not yet published', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    let userSubmission: AssignmentSubmissionDto | null = null;
    if (!isCourseInstructor && !isAdmin) {
      const [sub] = await this.db
        .select({
          submission: assignmentSubmissions,
          grade: assignmentGrades,
        })
        .from(assignmentSubmissions)
        .leftJoin(assignmentGrades, eq(assignmentSubmissions.id, assignmentGrades.submissionId))
        .where(
          and(
            eq(assignmentSubmissions.assignmentId, assignmentId),
            eq(assignmentSubmissions.studentId, userId)
          )
        )
        .orderBy(desc(assignmentSubmissions.version))
        .limit(1);

      if (sub) {
        userSubmission = {
          id: sub.submission.id,
          assignmentId: sub.submission.assignmentId,
          studentId: sub.submission.studentId,
          version: sub.submission.version,
          fileUrl: sub.submission.fileUrl,
          fileStorageKey: sub.submission.fileStorageKey,
          originalFilename: sub.submission.originalFilename,
          mimeType: sub.submission.mimeType,
          fileSizeBytes: sub.submission.fileSizeBytes,
          studentNotes: sub.submission.studentNotes,
          status: sub.submission.status,
          grade: sub.grade
            ? {
                id: sub.grade.id,
                submissionId: sub.grade.submissionId,
                graderId: sub.grade.graderId,
                score: sub.grade.score,
                maxScore: row.assignment.maxScore,
                percentage: Math.round((sub.grade.score / row.assignment.maxScore) * 100),
                feedback: sub.grade.feedback,
                rubricEvaluation: sub.grade.rubricEvaluation as any,
                gradedAt: sub.grade.gradedAt.toISOString(),
                updatedAt: sub.grade.updatedAt.toISOString(),
              }
            : null,
          submittedAt: sub.submission.submittedAt.toISOString(),
          updatedAt: sub.submission.updatedAt.toISOString(),
        };
      }
    }

    return {
      id: row.assignment.id,
      courseId: row.assignment.courseId,
      lessonId: row.assignment.lessonId,
      title: row.assignment.title,
      description: row.assignment.description,
      instructions: row.assignment.instructions,
      rubric: row.assignment.rubric as any,
      maxScore: row.assignment.maxScore,
      dueDate: row.assignment.dueDate?.toISOString() || null,
      status: row.assignment.status,
      allowResubmission: row.assignment.allowResubmission,
      submissionCount: row.submissionCount || 0,
      userSubmission,
      createdAt: row.assignment.createdAt.toISOString(),
      updatedAt: row.assignment.updatedAt.toISOString(),
    };
  }

  /**
   * Update assignment (Instructor/Admin)
   */
  async updateAssignment(
    courseId: string,
    assignmentId: string,
    userId: string,
    dto: UpdateAssignmentDto
  ): Promise<AssignmentDto> {
    await this.verifyInstructorOrAdmin(courseId, userId);

    const [existing] = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!existing) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    const updates: Partial<typeof assignments.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) {
      updates.title = validateAndSanitizeContent(dto.title, 'title');
    }
    if (dto.description !== undefined) {
      updates.description = validateAndSanitizeContent(dto.description, 'description');
    }
    if (dto.instructions !== undefined) {
      updates.instructions = dto.instructions ? validateAndSanitizeContent(dto.instructions, 'instructions') : null;
    }
    if (dto.maxScore !== undefined) {
      updates.maxScore = dto.maxScore;
    }
    if (dto.dueDate !== undefined) {
      updates.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.status !== undefined) {
      updates.status = dto.status;
    }
    if (dto.allowResubmission !== undefined) {
      updates.allowResubmission = dto.allowResubmission;
    }
    if (dto.rubric !== undefined) {
      updates.rubric = dto.rubric as any;
    }

    const [updated] = await this.db
      .update(assignments)
      .set(updates)
      .where(eq(assignments.id, assignmentId))
      .returning();

    await this.auditService.record({
      actorId: userId,
      action: 'ASSIGNMENT_UPDATED',
      targetType: 'ASSIGNMENT',
      targetId: assignmentId,
      metadata: { updates },
    });

    return {
      id: updated.id,
      courseId: updated.courseId,
      lessonId: updated.lessonId,
      title: updated.title,
      description: updated.description,
      instructions: updated.instructions,
      rubric: updated.rubric as any,
      maxScore: updated.maxScore,
      dueDate: updated.dueDate?.toISOString() || null,
      status: updated.status,
      allowResubmission: updated.allowResubmission,
      submissionCount: 0,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete assignment (Instructor/Admin)
   */
  async deleteAssignment(courseId: string, assignmentId: string, userId: string) {
    await this.verifyInstructorOrAdmin(courseId, userId);

    const [existing] = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!existing) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    await this.db.delete(assignments).where(eq(assignments.id, assignmentId));

    await this.auditService.record({
      actorId: userId,
      action: 'ASSIGNMENT_DELETED',
      targetType: 'ASSIGNMENT',
      targetId: assignmentId,
    });

    return { success: true, message: 'Assignment successfully deleted' };
  }

  /**
   * Submit an assignment (Student)
   */
  async submitAssignment(
    courseId: string,
    assignmentId: string,
    studentId: string,
    file: Express.Multer.File,
    studentNotes?: string
  ): Promise<AssignmentSubmissionDto> {
    const { user } = await this.verifyCourseAccess(courseId, studentId);

    const [assignment] = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!assignment) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    if (assignment.status !== 'PUBLISHED') {
      throw new ApiException(
        'ASSIGNMENT_NOT_OPEN: Assignment is not open for submissions',
        HttpStatus.BAD_REQUEST,
        'ASSIGNMENT_NOT_OPEN'
      );
    }

    // Check existing submissions
    const existing = await this.db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.studentId, studentId)
        )
      )
      .orderBy(desc(assignmentSubmissions.version));

    if (existing.length > 0 && !assignment.allowResubmission) {
      throw new ApiException(
        'Resubmission is not permitted for this assignment',
        HttpStatus.FORBIDDEN,
        'RESUBMISSION_DISABLED'
      );
    }

    const version = existing.length + 1;
    const sanitizedNotes = studentNotes ? validateAndSanitizeContent(studentNotes, 'studentNotes') : null;

    // Secure upload with magic-byte validation
    const uploadResult = await this.uploadService.uploadSubmissionFile(
      assignmentId,
      studentId,
      file
    );

    const [created] = await this.db
      .insert(assignmentSubmissions)
      .values({
        assignmentId,
        studentId,
        version,
        fileUrl: uploadResult.fileUrl,
        fileStorageKey: uploadResult.storageKey,
        originalFilename: uploadResult.originalFilename,
        mimeType: uploadResult.mimeType,
        fileSizeBytes: uploadResult.fileSizeBytes,
        studentNotes: sanitizedNotes,
        status: existing.length > 0 ? 'RESUBMITTED' : 'SUBMITTED',
      })
      .returning();

    await this.auditService.record({
      actorId: studentId,
      action: 'ASSIGNMENT_SUBMITTED',
      targetType: 'ASSIGNMENT_SUBMISSION',
      targetId: created.id,
      metadata: {
        assignmentId,
        version,
        fileType: uploadResult.detectedType,
        bytes: uploadResult.fileSizeBytes,
      },
    });

    return {
      id: created.id,
      assignmentId: created.assignmentId,
      studentId: created.studentId,
      studentName: user.name,
      studentEmail: user.email,
      version: created.version,
      fileUrl: created.fileUrl,
      fileStorageKey: created.fileStorageKey,
      originalFilename: created.originalFilename,
      mimeType: created.mimeType,
      fileSizeBytes: created.fileSizeBytes,
      studentNotes: created.studentNotes,
      status: created.status,
      grade: null,
      submittedAt: created.submittedAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * List student's own submissions for an assignment
   */
  async getMySubmissions(
    courseId: string,
    assignmentId: string,
    studentId: string
  ): Promise<AssignmentSubmissionDto[]> {
    await this.verifyCourseAccess(courseId, studentId);

    const [assignment] = await this.db
      .select({ id: assignments.id, maxScore: assignments.maxScore })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!assignment) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    const rows = await this.db
      .select({
        submission: assignmentSubmissions,
        grade: assignmentGrades,
        student: {
          name: users.name,
          email: users.email,
        },
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .leftJoin(assignmentGrades, eq(assignmentSubmissions.id, assignmentGrades.submissionId))
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.studentId, studentId)
        )
      )
      .orderBy(desc(assignmentSubmissions.version));

    return rows.map((r) => ({
      id: r.submission.id,
      assignmentId: r.submission.assignmentId,
      studentId: r.submission.studentId,
      studentName: r.student.name,
      studentEmail: r.student.email,
      version: r.submission.version,
      fileUrl: r.submission.fileUrl,
      fileStorageKey: r.submission.fileStorageKey,
      originalFilename: r.submission.originalFilename,
      mimeType: r.submission.mimeType,
      fileSizeBytes: r.submission.fileSizeBytes,
      studentNotes: r.submission.studentNotes,
      status: r.submission.status,
      grade: r.grade
        ? {
            id: r.grade.id,
            submissionId: r.grade.submissionId,
            graderId: r.grade.graderId,
            score: r.grade.score,
            maxScore: assignment.maxScore,
            percentage: Math.round((r.grade.score / assignment.maxScore) * 100),
            feedback: r.grade.feedback,
            rubricEvaluation: r.grade.rubricEvaluation as any,
            gradedAt: r.grade.gradedAt.toISOString(),
            updatedAt: r.grade.updatedAt.toISOString(),
          }
        : null,
      submittedAt: r.submission.submittedAt.toISOString(),
      updatedAt: r.submission.updatedAt.toISOString(),
    }));
  }

  /**
   * List all submissions for an assignment (Instructor/Admin)
   */
  async listSubmissions(
    courseId: string,
    assignmentId: string,
    userId: string,
    query: SubmissionListQuery
  ): Promise<PaginatedSubmissionsDto> {
    await this.verifyInstructorOrAdmin(courseId, userId);

    const [assignment] = await this.db
      .select({ id: assignments.id, maxScore: assignments.maxScore })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!assignment) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(assignmentSubmissions.assignmentId, assignmentId)];
    if (query.status) {
      conditions.push(eq(assignmentSubmissions.status, query.status));
    }
    if (query.studentId) {
      conditions.push(eq(assignmentSubmissions.studentId, query.studentId));
    }

    const whereClause = and(...conditions);

    const [countRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentSubmissions)
      .where(whereClause);

    const total = countRes?.count || 0;

    const rows = await this.db
      .select({
        submission: assignmentSubmissions,
        grade: assignmentGrades,
        student: {
          name: users.name,
          email: users.email,
        },
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .leftJoin(assignmentGrades, eq(assignmentSubmissions.id, assignmentGrades.submissionId))
      .where(whereClause)
      .orderBy(desc(assignmentSubmissions.submittedAt))
      .limit(limit)
      .offset(offset);

    const data: AssignmentSubmissionDto[] = rows.map((r) => ({
      id: r.submission.id,
      assignmentId: r.submission.assignmentId,
      studentId: r.submission.studentId,
      studentName: r.student.name,
      studentEmail: r.student.email,
      version: r.submission.version,
      fileUrl: r.submission.fileUrl,
      fileStorageKey: r.submission.fileStorageKey,
      originalFilename: r.submission.originalFilename,
      mimeType: r.submission.mimeType,
      fileSizeBytes: r.submission.fileSizeBytes,
      studentNotes: r.submission.studentNotes,
      status: r.submission.status,
      grade: r.grade
        ? {
            id: r.grade.id,
            submissionId: r.grade.submissionId,
            graderId: r.grade.graderId,
            score: r.grade.score,
            maxScore: assignment.maxScore,
            percentage: Math.round((r.grade.score / assignment.maxScore) * 100),
            feedback: r.grade.feedback,
            rubricEvaluation: r.grade.rubricEvaluation as any,
            gradedAt: r.grade.gradedAt.toISOString(),
            updatedAt: r.grade.updatedAt.toISOString(),
          }
        : null,
      submittedAt: r.submission.submittedAt.toISOString(),
      updatedAt: r.submission.updatedAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single submission by ID (Authorized student or Instructor/Admin)
   */
  async getSubmission(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    userId: string
  ): Promise<AssignmentSubmissionDto> {
    const { isCourseInstructor, isAdmin } = await this.verifyCourseAccess(courseId, userId);

    const [assignment] = await this.db
      .select({ id: assignments.id, maxScore: assignments.maxScore })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!assignment) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    const [row] = await this.db
      .select({
        submission: assignmentSubmissions,
        grade: assignmentGrades,
        student: {
          name: users.name,
          email: users.email,
        },
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .leftJoin(assignmentGrades, eq(assignmentSubmissions.id, assignmentGrades.submissionId))
      .where(
        and(
          eq(assignmentSubmissions.id, submissionId),
          eq(assignmentSubmissions.assignmentId, assignmentId)
        )
      )
      .limit(1);

    if (!row) {
      throw new ApiException('Submission not found', HttpStatus.NOT_FOUND, 'SUBMISSION_NOT_FOUND');
    }

    // Authorization: only student owner, course instructor, or admin can access
    const isOwner = row.submission.studentId === userId;
    if (!isOwner && !isCourseInstructor && !isAdmin) {
      throw new ApiException(
        'Access denied: You cannot view another student submission',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return {
      id: row.submission.id,
      assignmentId: row.submission.assignmentId,
      studentId: row.submission.studentId,
      studentName: row.student.name,
      studentEmail: row.student.email,
      version: row.submission.version,
      fileUrl: row.submission.fileUrl,
      fileStorageKey: row.submission.fileStorageKey,
      originalFilename: row.submission.originalFilename,
      mimeType: row.submission.mimeType,
      fileSizeBytes: row.submission.fileSizeBytes,
      studentNotes: row.submission.studentNotes,
      status: row.submission.status,
      grade: row.grade
        ? {
            id: row.grade.id,
            submissionId: row.grade.submissionId,
            graderId: row.grade.graderId,
            score: row.grade.score,
            maxScore: assignment.maxScore,
            percentage: Math.round((row.grade.score / assignment.maxScore) * 100),
            feedback: row.grade.feedback,
            rubricEvaluation: row.grade.rubricEvaluation as any,
            gradedAt: row.grade.gradedAt.toISOString(),
            updatedAt: row.grade.updatedAt.toISOString(),
          }
        : null,
      submittedAt: row.submission.submittedAt.toISOString(),
      updatedAt: row.submission.updatedAt.toISOString(),
    };
  }

  /**
   * Grade a submission (Instructor/Admin)
   */
  async gradeSubmission(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    graderId: string,
    dto: GradeSubmissionDto
  ): Promise<AssignmentGradeDto> {
    const { user: grader } = await this.verifyInstructorOrAdmin(courseId, graderId);

    const [assignment] = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId)))
      .limit(1);

    if (!assignment) {
      throw new ApiException('Assignment not found', HttpStatus.NOT_FOUND, 'ASSIGNMENT_NOT_FOUND');
    }

    if (dto.score > assignment.maxScore) {
      throw new ApiException(
        `SCORE_EXCEEDS_MAX: Grade score (${dto.score}) cannot exceed maximum allowed assignment score (${assignment.maxScore})`,
        HttpStatus.BAD_REQUEST,
        'SCORE_EXCEEDS_MAX'
      );
    }

    const [submission] = await this.db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.id, submissionId),
          eq(assignmentSubmissions.assignmentId, assignmentId)
        )
      )
      .limit(1);

    if (!submission) {
      throw new ApiException('Submission not found', HttpStatus.NOT_FOUND, 'SUBMISSION_NOT_FOUND');
    }

    const feedback = dto.feedback ? validateAndSanitizeContent(dto.feedback, 'feedback') : null;

    const grade = await this.db.transaction(async (tx) => {
      // Check existing grade
      const [existingGrade] = await tx
        .select()
        .from(assignmentGrades)
        .where(eq(assignmentGrades.submissionId, submissionId))
        .limit(1);

      let savedGrade: AssignmentGrade;

      if (existingGrade) {
        [savedGrade] = await tx
          .update(assignmentGrades)
          .set({
            graderId,
            score: dto.score,
            feedback,
            rubricEvaluation: dto.rubricEvaluation as any,
            updatedAt: new Date(),
          })
          .where(eq(assignmentGrades.id, existingGrade.id))
          .returning();
      } else {
        [savedGrade] = await tx
          .insert(assignmentGrades)
          .values({
            submissionId,
            graderId,
            score: dto.score,
            feedback,
            rubricEvaluation: dto.rubricEvaluation as any,
          })
          .returning();
      }

      await tx
        .update(assignmentSubmissions)
        .set({ status: 'GRADED', updatedAt: new Date() })
        .where(eq(assignmentSubmissions.id, submissionId));

      return savedGrade;
    });

    await this.auditService.record({
      actorId: graderId,
      action: 'ASSIGNMENT_GRADED',
      targetType: 'ASSIGNMENT_GRADE',
      targetId: grade.id,
      metadata: {
        submissionId,
        studentId: submission.studentId,
        score: dto.score,
        maxScore: assignment.maxScore,
      },
    });

    return {
      id: grade.id,
      submissionId: grade.submissionId,
      graderId: grade.graderId,
      graderName: grader.name,
      score: grade.score,
      maxScore: assignment.maxScore,
      percentage: Math.round((grade.score / assignment.maxScore) * 100),
      feedback: grade.feedback,
      rubricEvaluation: grade.rubricEvaluation as any,
      gradedAt: grade.gradedAt.toISOString(),
      updatedAt: grade.updatedAt.toISOString(),
    };
  }
}
