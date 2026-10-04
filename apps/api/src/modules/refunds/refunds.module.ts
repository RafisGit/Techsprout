import { Module } from '@nestjs/common';
import { AdminOrdersRefundController } from './admin-orders-refund.controller';
import { AdminRefundsController } from './admin-refunds.controller';
import { RefundsService } from './refunds.service';
import { PaymentsModule } from '../payments/payments.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PaymentsModule, AuditModule],
  controllers: [AdminOrdersRefundController, AdminRefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
