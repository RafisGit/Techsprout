import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../http/correlation-id.middleware';
import { ApiException } from '../errors/api-error';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector
      ? this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ])
      : [];

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user) {
      throw new ApiException(
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED'
      );
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ApiException(
        'Access denied: insufficient permissions',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return true;
  }
}
