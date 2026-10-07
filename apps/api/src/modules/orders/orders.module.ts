import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { RefundRequestsModule } from '../refunds/refund-requests.module';

@Module({
  imports: [DatabaseModule, AuditModule, forwardRef(() => RefundRequestsModule)],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

