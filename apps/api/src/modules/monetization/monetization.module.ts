import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { MonetizationLedgerService } from './monetization-ledger.service';
import { PayoutsService } from './payouts.service';
import { InstructorPayoutsController } from './instructor-payouts.controller';
import { AdminPayoutsController } from './admin-payouts.controller';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [InstructorPayoutsController, AdminPayoutsController],
  providers: [MonetizationLedgerService, PayoutsService],
  exports: [MonetizationLedgerService, PayoutsService],
})
export class MonetizationModule {}
