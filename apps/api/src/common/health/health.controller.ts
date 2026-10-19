import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.config';
import { QueueService } from '../../modules/queue/queue.service';
import {
  TelemetryPruningWorker,
  RetentionWorkerHealthDetails,
} from '../../modules/telemetry/telemetry-pruning.worker';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService,
    @Optional()
    @Inject(TelemetryPruningWorker)
    private readonly telemetryPruningWorker?: TelemetryPruningWorker
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'System Health Check' })
  @ApiResponse({ status: 200, description: 'System operational' })
  async getHealth() {
    let dbStatus: 'up' | 'down' = 'up';

    try {
      await this.db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'down';
    }

    let redisStatus: 'up' | 'down' = 'down';
    if (this.queueService) {
      try {
        const isHealthy = await this.queueService.isHealthy();
        redisStatus = isHealthy ? 'up' : 'down';
      } catch {
        redisStatus = 'down';
      }
    }

    let retentionWorkerStatus: 'ready' | 'degraded' | 'disabled' | 'unknown' = 'unknown';
    let retentionWorkerDetails: RetentionWorkerHealthDetails | undefined;

    if (this.telemetryPruningWorker) {
      try {
        retentionWorkerStatus = this.telemetryPruningWorker.getStatus();
        retentionWorkerDetails = this.telemetryPruningWorker.getHealthDetails();
      } catch {
        retentionWorkerStatus = 'degraded';
      }
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: env.NODE_ENV,
      services: {
        database: dbStatus,
        redis: redisStatus,
        retentionWorker: retentionWorkerStatus,
      },
      retentionWorker: retentionWorkerDetails,
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness Probe' })
  @ApiResponse({ status: 200, description: 'Application ready' })
  async getReadiness() {
    await this.db.execute(sql`SELECT 1`);
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }
}
