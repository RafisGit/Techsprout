import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentUploadService } from './assignment-upload.service';
import { MediaModule } from '../media/media.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [MediaModule, AuditModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentUploadService],
  exports: [AssignmentsService, AssignmentUploadService],
})
export class AssignmentsModule {}
