import { Module, forwardRef } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { AuditModule } from '../audit/audit.module';
import { ModulesModule } from '../modules/modules.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [AuditModule, ModulesModule, forwardRef(() => LearningModule)],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
