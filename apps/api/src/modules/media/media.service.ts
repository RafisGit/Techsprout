import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import {
  FilePayload,
  MediaDeleteResult,
  MediaResourceType,
  MediaUploadResult,
  SignedUploadParameters,
  UploadMediaOptions,
} from './interfaces/media.interface';
import { ApiException } from '../../common/errors/api-error';
import { SignedUploadRequestDto } from './dto/signed-upload-request.dto';
import * as crypto from 'crypto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  // Maximum allowed file sizes
  static readonly MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  static readonly MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB for proxy uploads

  // Supported MIME types
  static readonly ALLOWED_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ];

  static readonly ALLOWED_VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
  ];

  // Conventional folder structure
  static readonly CONVENTIONAL_FOLDERS = {
    image: [
      'techsprout/images/courses',
      'techsprout/images/instructors',
      'techsprout/images/categories',
      'techsprout/images/site',
    ],
    video: ['techsprout/videos/courses', 'techsprout/videos/lessons'],
  };

  constructor(@Inject(CloudinaryService) private readonly cloudinaryService: CloudinaryService) {}

  /**
   * Upload an image asset to Cloudinary.
   */
  async uploadImage(file: FilePayload, options?: UploadMediaOptions): Promise<MediaUploadResult> {
    this.validateImageFile(file);

    const folder = this.resolveFolder('image', options?.folder);
    const publicId = this.generatePublicId(options?.customIdentifier, file.originalname);

    this.logger.log(`Uploading image to folder=${folder}, publicId=${publicId}`);

    const result = await this.cloudinaryService.uploadStream(file.buffer, {
      folder,
      public_id: publicId,
      resource_type: 'image',
      overwrite: options?.overwrite ?? false,
      tags: options?.tags,
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: 'image',
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      originalFilename: file.originalname,
      createdAt: result.created_at || new Date().toISOString(),
    };
  }

  /**
   * Upload a video asset to Cloudinary.
   */
  async uploadVideo(file: FilePayload, options?: UploadMediaOptions): Promise<MediaUploadResult> {
    this.validateVideoFile(file);

    const folder = this.resolveFolder('video', options?.folder);
    const publicId = this.generatePublicId(options?.customIdentifier, file.originalname);

    this.logger.log(`Uploading video to folder=${folder}, publicId=${publicId}`);

    const result = await this.cloudinaryService.uploadStream(file.buffer, {
      folder,
      public_id: publicId,
      resource_type: 'video',
      overwrite: options?.overwrite ?? false,
      tags: options?.tags,
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: 'video',
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      duration: result.duration,
      originalFilename: file.originalname,
      createdAt: result.created_at || new Date().toISOString(),
    };
  }

  /**
   * Delete an image asset from Cloudinary.
   */
  async deleteImage(publicId: string): Promise<MediaDeleteResult> {
    this.validatePublicId(publicId);

    const res = await this.cloudinaryService.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });

    return {
      publicId,
      result: res.result,
      resourceType: 'image',
    };
  }

  /**
   * Delete a video asset from Cloudinary.
   */
  async deleteVideo(publicId: string): Promise<MediaDeleteResult> {
    this.validatePublicId(publicId);

    const res = await this.cloudinaryService.destroy(publicId, {
      resource_type: 'video',
      invalidate: true,
    });

    return {
      publicId,
      result: res.result,
      resourceType: 'video',
    };
  }

  /**
   * Delete media asset by resource type.
   */
  async deleteMedia(
    publicId: string,
    resourceType: MediaResourceType = 'image'
  ): Promise<MediaDeleteResult> {
    if (resourceType === 'video') {
      return this.deleteVideo(publicId);
    }
    return this.deleteImage(publicId);
  }

  /**
   * Replace an existing media asset with a new one.
   * Uploads new asset first, then deletes the old one.
   */
  async replaceMedia(
    oldPublicId: string,
    newFile: FilePayload,
    resourceType: MediaResourceType = 'image',
    options?: UploadMediaOptions
  ): Promise<MediaUploadResult> {
    this.validatePublicId(oldPublicId);

    // 1. Upload new asset
    const uploadResult =
      resourceType === 'video'
        ? await this.uploadVideo(newFile, options)
        : await this.uploadImage(newFile, options);

    // 2. Attempt deletion of previous asset
    try {
      await this.deleteMedia(oldPublicId, resourceType);
    } catch (err: any) {
      this.logger.warn(
        `Replaced asset uploaded (new=${uploadResult.publicId}) but old asset deletion failed (old=${oldPublicId}): ${err.message}`
      );
    }

    return uploadResult;
  }

  /**
   * Generates signed upload parameters for direct client-to-Cloudinary upload.
   * Eliminates proxying large video files through the NestJS server.
   */
  getSignedUploadParameters(dto: SignedUploadRequestDto): SignedUploadParameters {
    const resourceType = dto.resourceType || 'image';
    if (resourceType !== 'image' && resourceType !== 'video') {
      throw new ApiException(
        'Invalid resourceType. Allowed values are "image" or "video".',
        HttpStatus.BAD_REQUEST,
        'INVALID_RESOURCE_TYPE'
      );
    }

    const folder = this.resolveFolder(resourceType, dto.folder);
    const publicId = this.generatePublicId(undefined, dto.filename);

    const { signature, timestamp } = this.cloudinaryService.generateSignature({
      folder,
      public_id: publicId,
    });

    const cloudName = this.cloudinaryService.getCloudName();
    const apiKey = this.cloudinaryService.getApiKey();

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      publicId,
      resourceType,
      uploadUrl,
    };
  }

  /**
   * Returns delivery URL for a public ID.
   */
  getPublicUrl(
    publicId: string,
    options?: {
      resourceType?: MediaResourceType;
      format?: string;
    }
  ): string {
    this.validatePublicId(publicId);
    return this.cloudinaryService.getPublicUrl(publicId, options);
  }

  // ==========================================
  // Validation and Sanitization Helpers
  // ==========================================

  private validateImageFile(file: FilePayload): void {
    if (!file || !file.buffer) {
      throw new ApiException(
        'No image file payload provided.',
        HttpStatus.BAD_REQUEST,
        'MISSING_FILE_PAYLOAD'
      );
    }

    if (!MediaService.ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiException(
        `Unsupported image MIME type: ${file.mimetype}. Allowed types: ${MediaService.ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
        HttpStatus.BAD_REQUEST,
        'INVALID_IMAGE_TYPE'
      );
    }

    const size = file.size ?? file.buffer.length;
    if (size > MediaService.MAX_IMAGE_SIZE_BYTES) {
      throw new ApiException(
        `Image size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of ${MediaService.MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
        'FILE_TOO_LARGE'
      );
    }
  }

  private validateVideoFile(file: FilePayload): void {
    if (!file || !file.buffer) {
      throw new ApiException(
        'No video file payload provided.',
        HttpStatus.BAD_REQUEST,
        'MISSING_FILE_PAYLOAD'
      );
    }

    if (!MediaService.ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiException(
        `Unsupported video MIME type: ${file.mimetype}. Allowed types: ${MediaService.ALLOWED_VIDEO_MIME_TYPES.join(', ')}`,
        HttpStatus.BAD_REQUEST,
        'INVALID_VIDEO_TYPE'
      );
    }

    const size = file.size ?? file.buffer.length;
    if (size > MediaService.MAX_VIDEO_SIZE_BYTES) {
      throw new ApiException(
        `Video size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of ${MediaService.MAX_VIDEO_SIZE_BYTES / (1024 * 1024)} MB. For larger videos, use direct signed upload.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
        'FILE_TOO_LARGE'
      );
    }
  }

  private validatePublicId(publicId: string): void {
    if (!publicId || typeof publicId !== 'string' || publicId.trim().length === 0) {
      throw new ApiException(
        'Invalid public ID: public ID cannot be empty.',
        HttpStatus.BAD_REQUEST,
        'INVALID_PUBLIC_ID'
      );
    }

    // Guard against path traversal
    if (publicId.includes('..') || publicId.startsWith('/') || publicId.startsWith('\\')) {
      throw new ApiException(
        'Invalid public ID: malicious path traversal detected.',
        HttpStatus.BAD_REQUEST,
        'INVALID_PUBLIC_ID'
      );
    }
  }

  private resolveFolder(resourceType: MediaResourceType, requestedFolder?: string): string {
    const defaultFolder =
      resourceType === 'video' ? 'techsprout/videos/courses' : 'techsprout/images/site';

    if (!requestedFolder) {
      return defaultFolder;
    }

    // Clean folder string
    const cleaned = requestedFolder.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

    // Check if cleaned folder starts with the allowed root convention
    const allowedRoots = resourceType === 'video' ? 'techsprout/videos' : 'techsprout/images';

    if (!cleaned.startsWith(allowedRoots)) {
      this.logger.warn(
        `Folder "${requestedFolder}" does not match convention "${allowedRoots}". Prepending prefix.`
      );
      return `${allowedRoots}/${cleaned}`;
    }

    return cleaned;
  }

  private generatePublicId(customIdentifier?: string, originalFilename?: string): string {
    let base = 'asset';

    if (customIdentifier && customIdentifier.trim().length > 0) {
      base = this.sanitizeIdentifier(customIdentifier);
    } else if (originalFilename) {
      const nameWithoutExt = originalFilename.replace(/\.[^/.]+$/, '');
      base = this.sanitizeIdentifier(nameWithoutExt);
    }

    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    return `${base}_${uniqueSuffix}`;
  }

  private sanitizeIdentifier(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);
  }
}
