import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaResourceType } from '../interfaces/media.interface';

export class DeleteMediaDto {
  @ApiProperty({
    description: 'Cloudinary Public ID to delete',
    example: 'techsprout/images/courses/course_unity_12345678',
  })
  publicId!: string;

  @ApiPropertyOptional({
    description: 'Cloudinary resource type',
    enum: ['image', 'video'],
    default: 'image',
  })
  resourceType?: MediaResourceType;
}
