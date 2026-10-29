import { Module, forwardRef } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';
import { AuditModule } from '../audit/audit.module';
import { CoursesModule } from '../courses/courses.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [AuditModule, CoursesModule, forwardRef(() => LearningModule)],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
