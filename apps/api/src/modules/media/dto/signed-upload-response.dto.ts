import { ApiProperty } from '@nestjs/swagger';
import { MediaResourceType } from '../interfaces/media.interface';

export class SignedUploadResponseDto {
  @ApiProperty({ description: 'SHA signature generated using server API secret' })
  signature!: string;

  @ApiProperty({ description: 'Timestamp when signature was generated (epoch seconds)' })
  timestamp!: number;

  @ApiProperty({ description: 'Public Cloudinary API Key' })
  apiKey!: string;

  @ApiProperty({ description: 'Public Cloudinary Cloud Name' })
  cloudName!: string;

  @ApiProperty({ description: 'Target folder on Cloudinary' })
  folder!: string;

  @ApiProperty({ description: 'Sanitized public ID assigned for the upload' })
  publicId!: string;

  @ApiProperty({ description: 'Resource type', enum: ['image', 'video'] })
  resourceType!: MediaResourceType;

  @ApiProperty({ description: 'Target Cloudinary REST endpoint URL to POST upload to' })
  uploadUrl!: string;
}
