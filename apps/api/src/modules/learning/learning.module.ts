import { Module } from '@nestjs/common';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';
import { AuditModule } from '../audit/audit.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [AuditModule, CertificatesModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
