import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { auditLogs } from '../../database/schema';
import { desc } from 'drizzle-orm';

export interface CreateAuditLogParams {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /**
   * Append-only record creation for security and compliance.
   * Modifying or deleting audit records is intentionally not supported.
   */
  async record(params: CreateAuditLogParams): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        actorId: params.actorId || null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        requestId: params.requestId || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      });

      this.logger.log(
        `[AUDIT] action=${params.action} target=${params.targetType}:${params.targetId || 'none'} actor=${params.actorId || 'system'}`
      );
    } catch (error) {
      this.logger.error('Failed to write audit log entry:', error);
    }
  }

  async list(limit = 50, offset = 0) {
    return this.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
