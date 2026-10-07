import { Module } from '@nestjs/common';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminReconciliationController } from './admin-reconciliation.controller';
import { FinanceService } from './finance.service';
import { FinanceCsvService } from './finance-csv.service';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AdminFinanceController, AdminReconciliationController],
  providers: [FinanceService, FinanceCsvService],
  exports: [FinanceService, FinanceCsvService],
})
export class FinanceModule {}
