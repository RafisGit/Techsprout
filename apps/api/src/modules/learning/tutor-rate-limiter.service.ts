import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  retryAfterSeconds: number;
}

@Injectable()
export class TutorRateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TutorRateLimiterService.name);
  private client: IORedis | null = null;
  private isConnected = false;

  public static readonly DAILY_LIMIT = 20;

  // In-memory fallback to enforce the 20-query limit if Redis is unreachable
  // Prevents unlimited model calls in disconnected/fallback environments
  private readonly memoryStore = new Map<string, number>();

  onModuleInit() {
    this.initRedis();
  }

  onModuleDestroy() {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // Safe disposal
      }
    }
  }

  private initRedis() {
    try {
      this.client = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 2) {
            this.logger.debug(
              'Redis unavailable for TutorRateLimiterService; operating in safe in-memory rate-limit mode.'
            );
            return null;
          }
          return Math.min(times * 100, 500);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Redis connection established for TutorRateLimiterService.');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.debug(
          `Redis notice in TutorRateLimiterService: ${err.message}. Enforcing in-memory limits.`
        );
      });

      this.client.connect().catch(() => {
        this.logger.debug('Initial Redis connection deferred; in-memory limiter active.');
      });
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(`Failed to initialize Redis client: ${(err as Error).message}`);
    }
  }

  /**
   * Calculates seconds remaining until midnight UTC.
   */
  private getSecondsUntilMidnightUtc(): number {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  }

  /**
   * Atomically increments the daily tutor query counter for studentId.
   * Returns whether the request is allowed (<= 20) or rejected (> 20).
   */
  async checkAndIncrement(studentId: string): Promise<RateLimitResult> {
    const dateKey = new Date().toISOString().slice(0, 10);
    const redisKey = `tutor:ratelimit:${studentId}:${dateKey}`;
    const ttlSeconds = this.getSecondsUntilMidnightUtc();

    let count: number;

    if (this.client && this.isConnected) {
      try {
        count = await this.client.incr(redisKey);
        if (count === 1) {
          // Set expiration to midnight UTC
          await this.client.expire(redisKey, ttlSeconds);
        }
      } catch (err) {
        this.logger.warn(
          `Redis incr failed (${(err as Error).message}); falling back to safe in-memory enforcement.`
        );
        count = this.incrementInMemory(redisKey);
      }
    } else {
      count = this.incrementInMemory(redisKey);
    }

    const allowed = count <= TutorRateLimiterService.DAILY_LIMIT;

    return {
      allowed,
      currentCount: count,
      limit: TutorRateLimiterService.DAILY_LIMIT,
      retryAfterSeconds: allowed ? 0 : ttlSeconds,
    };
  }

  private incrementInMemory(key: string): number {
    const current = this.memoryStore.get(key) || 0;
    const next = current + 1;
    this.memoryStore.set(key, next);
    return next;
  }

  /**
   * Resets rate-limit counter (primarily for test automation).
   */
  async reset(studentId: string): Promise<void> {
    const dateKey = new Date().toISOString().slice(0, 10);
    const redisKey = `tutor:ratelimit:${studentId}:${dateKey}`;
    this.memoryStore.delete(redisKey);
    if (this.client && this.isConnected) {
      try {
        await this.client.del(redisKey);
      } catch {
        // Ignore in test cleanup
      }
    }
  }
}
