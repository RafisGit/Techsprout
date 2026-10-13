import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsCacheService } from './analytics.cache.service';
import { ValidateCourseIdGuard } from './guards/validate-course-id.guard';
import { InstructorAnalyticsController } from './instructor-analytics.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { LearningAnalyticsController } from './learning-analytics.controller';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [
    InstructorAnalyticsController,
    AdminAnalyticsController,
    LearningAnalyticsController,
  ],
  providers: [AnalyticsService, AnalyticsCacheService, ValidateCourseIdGuard],
  exports: [AnalyticsService, AnalyticsCacheService],
})
export class AnalyticsModule {}
