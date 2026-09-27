import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { users, roles, userRoles } from '../../database/schema';
import { eq, desc } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async listUsers(limit = 50, offset = 0) {
    const records = await this.db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        isActive: users.isActive,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        role: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return records.map((u) => ({
      ...u,
      role: u.role || 'student',
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async assignRole(
    targetUserId: string,
    roleName: string,
    adminActorId: string,
    ipAddress?: string,
    requestId?: string
  ) {
    // 1. Verify target user exists
    const targetUser = await this.db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (targetUser.length === 0) {
      throw new ApiException('User not found', HttpStatus.NOT_FOUND, 'USER_NOT_FOUND');
    }

    // 2. Verify target role exists
    const targetRole = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, roleName))
      .limit(1);

    if (targetRole.length === 0) {
      throw new ApiException('Invalid role specified', HttpStatus.BAD_REQUEST, 'ROLE_INVALID');
    }

    // 3. Update user role
    await this.db.delete(userRoles).where(eq(userRoles.userId, targetUserId));
    await this.db.insert(userRoles).values({
      userId: targetUserId,
      roleId: targetRole[0].id,
    });

    // 4. Audit log role elevation/change
    await this.auditService.record({
      actorId: adminActorId,
      action: 'ROLE_ASSIGNED',
      targetType: 'USER',
      targetId: targetUserId,
      ipAddress,
      requestId,
      metadata: { newRole: roleName },
    });

    return {
      success: true,
      message: `Role ${roleName} assigned successfully to user ${targetUserId}`,
    };
  }
}
