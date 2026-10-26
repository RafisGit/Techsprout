import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MandatesController } from './mandates.controller';
import { MandatesService } from './mandates.service';
import { SSLCommerzClient, SSLCOMMERZ_CLIENT } from './sslcommerz.client';
import { MockRecurringPaymentAdapter } from './mock-recurring.adapter';
import { RECURRING_PAYMENT_ADAPTER } from './recurring-adapter.interface';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { env } from '../../config/env.config';

@Module({
  imports: [DatabaseModule, AuditModule, forwardRef(() => OrdersModule)],
  controllers: [PaymentsController, MandatesController],
  providers: [
    PaymentsService,
    MandatesService,
    MockRecurringPaymentAdapter,
    {
      provide: RECURRING_PAYMENT_ADAPTER,
      useClass: MockRecurringPaymentAdapter,
    },
    {
      provide: SSLCOMMERZ_CLIENT,
      useFactory: () => {
        return new SSLCommerzClient({
          storeId: env.SSLCOMMERZ_STORE_ID,
          storePassword: env.SSLCOMMERZ_STORE_PASSWORD,
          baseUrl: env.SSLCOMMERZ_BASE_URL,
        });
      },
    },
  ],
  exports: [PaymentsService, MandatesService, SSLCOMMERZ_CLIENT, RECURRING_PAYMENT_ADAPTER],
})
export class PaymentsModule {}
