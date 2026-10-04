import { Module } from '@nestjs/common';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminReconciliationController } from './admin-reconciliation.controller';
import { FinanceService } from './finance.service';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AdminFinanceController, AdminReconciliationController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
