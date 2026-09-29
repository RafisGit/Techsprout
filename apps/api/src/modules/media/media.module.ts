import { Module } from '@nestjs/common';
import { CloudinaryProvider } from './cloudinary/cloudinary.provider';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MediaController],
  providers: [CloudinaryProvider, CloudinaryService, MediaService],
  exports: [MediaService, CloudinaryService],
})
export class MediaModule {}
