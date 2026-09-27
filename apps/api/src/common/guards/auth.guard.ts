import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../http/correlation-id.middleware';
import { ApiException } from '../errors/api-error';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { sessions, users, userRoles, roles } from '../../database/schema';
import { eq, and, gt } from 'drizzle-orm';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector
      ? this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          context.getHandler(),
          context.getClass(),
        ])
      : false;

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // 1. Extract session token from Cookie or Bearer header
    let token: string | undefined = request.cookies?.['techsprout_session'];

    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      throw new ApiException(
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED'
      );
    }

    // 2. Validate token against active sessions in database
    const now = new Date();
    const sessionRecords = await this.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        userName: users.name,
        userEmail: users.email,
        userPhone: users.phone,
        username: users.username,
        isVerified: users.isVerified,
        isActive: users.isActive,
        roleName: roles.name,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
      .limit(1);

    if (sessionRecords.length === 0) {
      throw new ApiException(
        'Session invalid or expired',
        HttpStatus.UNAUTHORIZED,
        'SESSION_EXPIRED'
      );
    }

    const session = sessionRecords[0];

    if (!session.isActive) {
      throw new ApiException(
        'User account is disabled',
        HttpStatus.FORBIDDEN,
        'ACCOUNT_DISABLED'
      );
    }

    request.user = {
      id: session.userId,
      email: session.userEmail,
      phone: session.userPhone,
      username: session.username,
      name: session.userName,
      role: session.roleName || 'student',
      isVerified: session.isVerified,
    };

    return true;
  }
}
