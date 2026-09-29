import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaResourceType } from '../interfaces/media.interface';

export class ReplaceMediaDto {
  @ApiProperty({
    description: 'Cloudinary Public ID of the existing asset to replace',
    example: 'techsprout/images/courses/course_unity_12345678',
  })
  oldPublicId!: string;

  @ApiPropertyOptional({
    description: 'Cloudinary resource type of the asset',
    enum: ['image', 'video'],
    default: 'image',
  })
  resourceType?: MediaResourceType;

  @ApiPropertyOptional({
    description: 'Target Cloudinary folder path',
    example: 'techsprout/images/courses',
  })
  folder?: string;

  @ApiPropertyOptional({
    description: 'Custom alphanumeric identifier for the replacement asset',
  })
  customIdentifier?: string;
}
