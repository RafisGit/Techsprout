import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { AuditModule } from '../audit/audit.module';
import { ModulesModule } from '../modules/modules.module';

@Module({
  imports: [AuditModule, ModulesModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
