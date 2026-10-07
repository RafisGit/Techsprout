import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq, or } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  courses,
  modules,
  lessons,
  quizzes,
  quizQuestions,
  quizQuestionOptions,
  media,
} from '../../database/schema';
import { AuditService } from '../../modules/audit/audit.service';
import { AuthenticatedRequest } from '../http/correlation-id.middleware';
import { ApiException } from '../errors/api-error';
import {
  RESOURCE_OWNERSHIP_KEY,
  ResourceOwnershipMetadata,
  TargetResourceType,
} from '../auth/decorators/resource-ownership.decorator';

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<ResourceOwnershipMetadata | undefined>(
      RESOURCE_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If no ownership metadata is attached, let the request proceed
    if (!metadata) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!req.user) {
      throw new ApiException(
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED'
      );
    }

    // 1. Superuser Rule: Administrators bypass resource-level ownership checks
    if (req.user.role === 'admin') {
      return true;
    }

    // 2. Non-admin and non-instructor users cannot access instructor-managed resources
    if (req.user.role !== 'instructor') {
      throw new ApiException(
        'Access denied: insufficient permissions',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    // 3. Extract the target resource ID from route parameters or query/body
    const { resourceType, idParamKey } = metadata;
    const resourceId =
      req.params?.[idParamKey] ||
      (req.query as Record<string, string>)?.[idParamKey] ||
      (req.body as Record<string, string>)?.[idParamKey];

    if (!resourceId || typeof resourceId !== 'string') {
      throw new ApiException(
        `Target resource identifier "${idParamKey}" is missing`,
        HttpStatus.BAD_REQUEST,
        'INVALID_RESOURCE_ID'
      );
    }

    // 4. Resolve the resource and enforce ownership
    const isOwner = await this.verifyOwnership(resourceType, resourceId, req.user.id);

    if (!isOwner) {
      // Audit the unauthorized access attempt
      await this.auditService.record({
        actorId: req.user.id,
        action: 'UNAUTHORIZED_RESOURCE_ACCESS_ATTEMPT',
        targetType: resourceType.toUpperCase(),
        targetId: resourceId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        requestId: req.id,
        metadata: {
          resourceType,
          resourceId,
          userRole: req.user.role,
        },
      });

      throw new ApiException(
        'Access denied: you do not have permission to manage this resource',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return true;
  }

  private async verifyOwnership(
    resourceType: TargetResourceType,
    resourceId: string,
    instructorUserId: string
  ): Promise<boolean> {
    switch (resourceType) {
      case 'course': {
        const [course] = await this.db
          .select({ id: courses.id, instructorId: courses.instructorId })
          .from(courses)
          .where(eq(courses.id, resourceId))
          .limit(1);

        if (!course) {
          throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
        }
        return course.instructorId === instructorUserId;
      }

      case 'module': {
        const [mod] = await this.db
          .select({ id: modules.id, courseInstructorId: courses.instructorId })
          .from(modules)
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .where(eq(modules.id, resourceId))
          .limit(1);

        if (!mod) {
          throw new ApiException('Module not found', HttpStatus.NOT_FOUND, 'MODULE_NOT_FOUND');
        }
        return mod.courseInstructorId === instructorUserId;
      }

      case 'lesson': {
        const [les] = await this.db
          .select({ id: lessons.id, courseInstructorId: courses.instructorId })
          .from(lessons)
          .innerJoin(modules, eq(lessons.moduleId, modules.id))
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .where(eq(lessons.id, resourceId))
          .limit(1);

        if (!les) {
          throw new ApiException('Lesson not found', HttpStatus.NOT_FOUND, 'LESSON_NOT_FOUND');
        }
        return les.courseInstructorId === instructorUserId;
      }

      case 'quiz': {
        const [qz] = await this.db
          .select({ id: quizzes.id, courseInstructorId: courses.instructorId })
          .from(quizzes)
          .innerJoin(modules, eq(quizzes.moduleId, modules.id))
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .where(eq(quizzes.id, resourceId))
          .limit(1);

        if (!qz) {
          throw new ApiException('Quiz not found', HttpStatus.NOT_FOUND, 'QUIZ_NOT_FOUND');
        }
        return qz.courseInstructorId === instructorUserId;
      }

      case 'quizQuestion': {
        const [qq] = await this.db
          .select({ id: quizQuestions.id, courseInstructorId: courses.instructorId })
          .from(quizQuestions)
          .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
          .innerJoin(modules, eq(quizzes.moduleId, modules.id))
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .where(eq(quizQuestions.id, resourceId))
          .limit(1);

        if (!qq) {
          throw new ApiException('Quiz question not found', HttpStatus.NOT_FOUND, 'QUESTION_NOT_FOUND');
        }
        return qq.courseInstructorId === instructorUserId;
      }

      case 'quizOption': {
        const [opt] = await this.db
          .select({ id: quizQuestionOptions.id, courseInstructorId: courses.instructorId })
          .from(quizQuestionOptions)
          .innerJoin(quizQuestions, eq(quizQuestionOptions.questionId, quizQuestions.id))
          .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
          .innerJoin(modules, eq(quizzes.moduleId, modules.id))
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .where(eq(quizQuestionOptions.id, resourceId))
          .limit(1);

        if (!opt) {
          throw new ApiException('Quiz option not found', HttpStatus.NOT_FOUND, 'OPTION_NOT_FOUND');
        }
        return opt.courseInstructorId === instructorUserId;
      }

      case 'media': {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId);
        const condition = isUuid
          ? or(eq(media.id, resourceId), eq(media.storageKey, resourceId))
          : eq(media.storageKey, resourceId);

        const [med] = await this.db
          .select({ id: media.id, uploaderId: media.uploaderId })
          .from(media)
          .where(condition)
          .limit(1);

        if (!med) {
          throw new ApiException('Media not found', HttpStatus.NOT_FOUND, 'MEDIA_NOT_FOUND');
        }
        // If media has an uploader, instructor must match. If null (legacy/system media), allow access
        return !med.uploaderId || med.uploaderId === instructorUserId;
      }

      default:
        return false;
    }
  }
}
