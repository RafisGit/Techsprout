import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaResourceType } from '../interfaces/media.interface';

export class MediaResponseDto {
  @ApiPropertyOptional({ description: 'PostgreSQL Media ID (UUID)' })
  id?: string;

  @ApiProperty({ description: 'Cloudinary Public ID' })
  publicId!: string;

  @ApiProperty({ description: 'Secure HTTPS delivery URL' })
  secureUrl!: string;

  @ApiProperty({ description: 'Media resource type', enum: ['image', 'video'] })
  resourceType!: MediaResourceType;

  @ApiProperty({ description: 'Media format extension', example: 'jpg' })
  format!: string;

  @ApiProperty({ description: 'File size in bytes' })
  bytes!: number;

  @ApiPropertyOptional({ description: 'Asset width in pixels' })
  width?: number;

  @ApiPropertyOptional({ description: 'Asset height in pixels' })
  height?: number;

  @ApiPropertyOptional({ description: 'Duration in seconds (for video)' })
  duration?: number;

  @ApiPropertyOptional({ description: 'Original uploaded filename' })
  originalFilename?: string;

  @ApiProperty({ description: 'ISO creation timestamp' })
  createdAt!: string;
}
