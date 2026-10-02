import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CertificateService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { AdminCertificatesController } from './admin-certificates.controller';

@Module({
  imports: [AuditModule],
  controllers: [CertificatesController, AdminCertificatesController],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificatesModule {}
