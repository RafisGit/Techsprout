import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationQueueService } from './notification-queue.service';
import { ResendEmailProvider } from './providers/resend.provider';
import { EMAIL_PROVIDER } from './interfaces/email-provider.interface';

@Module({
  imports: [AuditModule, forwardRef(() => EventsModule)],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationQueueService,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useExisting: ResendEmailProvider,
    },
  ],
  exports: [NotificationsService, NotificationQueueService, EMAIL_PROVIDER],
})
export class NotificationsModule {}
