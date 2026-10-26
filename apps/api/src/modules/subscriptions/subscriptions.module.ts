import { Module } from '@nestjs/common';
import { SubscriptionBillingService } from './subscription-billing.service';
import { SubscriptionBillingWorker } from './subscription-billing.worker';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [DatabaseModule, AuditModule, PaymentsModule],
  providers: [SubscriptionBillingService, SubscriptionBillingWorker],
  exports: [SubscriptionBillingService, SubscriptionBillingWorker],
})
export class SubscriptionsModule {}
