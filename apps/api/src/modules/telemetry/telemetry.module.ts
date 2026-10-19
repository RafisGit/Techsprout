import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryPrivacyService } from './telemetry-privacy.service';
import { TelemetryPruningWorker } from './telemetry-pruning.worker';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryPrivacyService, TelemetryPruningWorker],
  exports: [TelemetryService, TelemetryPrivacyService, TelemetryPruningWorker],
})
export class TelemetryModule {}
