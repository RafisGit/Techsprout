import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { ApiException } from '../../../common/errors/api-error';

const uuidSchema = z.string().uuid();

@Injectable()
export class ValidateCourseIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const courseId = req.params?.courseId ?? req.params?.id;
    if (courseId !== undefined) {
      const parseResult = uuidSchema.safeParse(courseId);
      if (!parseResult.success) {
        throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
      }
    }
    return true;
  }
}
