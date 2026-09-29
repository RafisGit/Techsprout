import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadMediaDto {
  @ApiPropertyOptional({
    description: 'Target Cloudinary folder path',
    example: 'techsprout/images/courses',
  })
  folder?: string;

  @ApiPropertyOptional({
    description: 'Custom alphanumeric identifier for the asset (sanitized server-side)',
    example: 'course-unity-game-dev',
  })
  customIdentifier?: string;
}
