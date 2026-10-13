import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';

@Injectable()
export class AnalyticsCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsCacheService.name);
  private client: IORedis | null = null;
  private isConnected = false;

  // Local fallback memory cache for environments without Redis running (e.g. unit test suites)
  private memoryCache = new Map<string, { value: string; expiresAt: number }>();

  onModuleInit() {
    this.initRedis();
  }

  private initRedis() {
    try {
      this.client = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 2) {
            this.logger.debug('Redis unavailable; AnalyticsCacheService operating in fail-open memory standby.');
            return null;
          }
          return Math.min(times * 100, 500);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Redis connection established for AnalyticsCacheService.');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.debug(`Redis notice: ${err.message}. Cache service falling open to resilient standby.`);
      });

      this.client.connect().catch(() => {
        this.logger.debug('Initial Redis connection deferred; cache in standby.');
      });
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(`Failed to initialize Redis client: ${(err as Error).message}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.client && this.isConnected) {
        const raw = await this.client.get(key);
        if (raw) {
          return JSON.parse(raw) as T;
        }
        return null;
      }
    } catch (err) {
      this.logger.debug(`Redis GET failed for key "${key}": ${(err as Error).message}. Checking fallback.`);
    }

    // Memory fallback
    const item = this.memoryCache.get(key);
    if (item) {
      if (Date.now() > item.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }
      return JSON.parse(item.value) as T;
    }

    return null;
  }

  async set(key: string, value: unknown, ttlSeconds = 600): Promise<void> {
    const serialized = JSON.stringify(value);
    try {
      if (this.client && this.isConnected) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
        return;
      }
    } catch (err) {
      this.logger.debug(`Redis SET failed for key "${key}": ${(err as Error).message}. Using fallback.`);
    }

    // Memory fallback
    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.del(key);
      }
    } catch (err) {
      this.logger.debug(`Redis DEL failed for key "${key}": ${(err as Error).message}`);
    }
    this.memoryCache.delete(key);
  }

  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  buildInstructorOverviewKey(instructorId: string): string {
    return `instructor:analytics:overview:${instructorId}`;
  }

  buildCourseAnalyticsKey(courseId: string, rangeHash: string): string {
    return `course:analytics:${courseId}:${rangeHash}`;
  }

  buildAdminOverviewKey(): string {
    return 'admin:analytics:overview';
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
    this.memoryCache.clear();
  }
}
