import { Module, forwardRef } from '@nestjs/common';
import { AdminOrdersRefundController } from './admin-orders-refund.controller';
import { AdminRefundsController } from './admin-refunds.controller';
import { RefundsService } from './refunds.service';
import { PaymentsModule } from '../payments/payments.module';
import { MonetizationModule } from '../monetization/monetization.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [forwardRef(() => PaymentsModule), forwardRef(() => MonetizationModule), AuditModule],
  controllers: [
    AdminOrdersRefundController,
    AdminRefundsController,
  ],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}

