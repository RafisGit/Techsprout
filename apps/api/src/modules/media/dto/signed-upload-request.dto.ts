import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaResourceType } from '../interfaces/media.interface';

export class SignedUploadRequestDto {
  @ApiProperty({
    description: 'Cloudinary resource type',
    enum: ['image', 'video'],
    example: 'video',
  })
  resourceType!: MediaResourceType;

  @ApiPropertyOptional({
    description: 'Target Cloudinary folder',
    example: 'techsprout/videos/lessons',
  })
  folder?: string;

  @ApiPropertyOptional({
    description: 'Original or sanitized filename hint',
    example: 'lesson-01-introduction.mp4',
  })
  filename?: string;
}
