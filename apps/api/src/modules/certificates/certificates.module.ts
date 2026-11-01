import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CertificateService } from './certificates.service';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificatesController } from './certificates.controller';
import { AdminCertificatesController } from './admin-certificates.controller';

@Module({
  imports: [AuditModule],
  controllers: [CertificatesController, AdminCertificatesController],
  providers: [CertificateService, CertificatePdfService],
  exports: [CertificateService, CertificatePdfService],
})
export class CertificatesModule {}
