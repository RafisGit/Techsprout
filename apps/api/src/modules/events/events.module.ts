import { Module, Global, forwardRef } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
  imports: [forwardRef(() => NotificationsModule)],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class EventsModule {}
