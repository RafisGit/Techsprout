import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { InstructorCoursesController } from './instructor-courses.controller';
import { PublicCoursesController } from './public-courses.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CoursesController, InstructorCoursesController, PublicCoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
