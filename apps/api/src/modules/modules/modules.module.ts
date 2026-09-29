import { Module } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';
import { AuditModule } from '../audit/audit.module';
import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [AuditModule, CoursesModule],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
