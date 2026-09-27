import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.config';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

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

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: env.NODE_ENV,
      services: {
        database: dbStatus,
      },
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness Probe' })
  async getReadiness() {
    await this.db.execute(sql`SELECT 1`);
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }
}
