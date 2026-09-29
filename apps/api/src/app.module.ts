import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OtpModule } from './modules/otp/otp.module';
import { UsersModule } from './modules/users/users.module';
import { QueueModule } from './modules/queue/queue.module';
import { MediaModule } from './modules/media/media.module';

import { HealthController } from './common/health/health.controller';
import { CorrelationIdMiddleware } from './common/http/correlation-id.middleware';
import { AuthGuard } from './common/guards/auth.guard';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per minute
      },
    ]),
    DatabaseModule,
    AuditModule,
    IdentityModule,
    OtpModule,
    UsersModule,
    QueueModule,
    MediaModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
