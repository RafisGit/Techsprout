import { Module, forwardRef } from '@nestjs/common';
import { RefundRequestsController } from './refund-requests.controller';
import { AdminRefundRequestsController } from './admin-refund-requests.controller';
import { RefundRequestsService } from './refund-requests.service';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { RefundsModule } from './refunds.module';

@Module({
  imports: [DatabaseModule, AuditModule, forwardRef(() => RefundsModule)],
  controllers: [RefundRequestsController, AdminRefundRequestsController],
  providers: [RefundRequestsService],
  exports: [RefundRequestsService],
})
export class RefundRequestsModule {}
