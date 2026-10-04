import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SSLCommerzClient, SSLCOMMERZ_CLIENT } from './sslcommerz.client';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { env } from '../../config/env.config';

@Module({
  imports: [DatabaseModule, AuditModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
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
  exports: [PaymentsService, SSLCOMMERZ_CLIENT],
})
export class PaymentsModule {}
