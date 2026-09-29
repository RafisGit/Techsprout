import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import {
  v2 as cloudinaryType,
  UploadApiResponse,
  UploadApiErrorResponse,
  UploadApiOptions,
} from 'cloudinary';
import { CLOUDINARY_CLIENT } from './cloudinary.config';
import { env } from '../../../config/env.config';
import { ApiException } from '../../../common/errors/api-error';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    @Inject(CLOUDINARY_CLIENT)
    private readonly cloudinaryClient: typeof cloudinaryType
  ) {}

  /**
   * Checks whether Cloudinary is configured with valid environment credentials.
   */
  isConfigured(): boolean {
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
    );
  }

  /**
   * Ensures Cloudinary is configured before performing cloud operations.
   */
  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ApiException(
        'Cloudinary media service is not configured. Please supply CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
        HttpStatus.SERVICE_UNAVAILABLE,
        'CLOUDINARY_NOT_CONFIGURED'
      );
    }
  }

  /**
   * Returns the server-only API secret.
   * Never exposed to frontend or logged.
   */
  getApiSecret(): string {
    this.assertConfigured();
    return env.CLOUDINARY_API_SECRET!;
  }

  /**
   * Returns the public Cloud Name.
   */
  getCloudName(): string {
    this.assertConfigured();
    return env.CLOUDINARY_CLOUD_NAME!;
  }

  /**
   * Returns the public API Key.
   */
  getApiKey(): string {
    this.assertConfigured();
    return env.CLOUDINARY_API_KEY!;
  }

  /**
   * Uploads a file buffer directly to Cloudinary using an upload stream.
   */
  async uploadStream(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
    this.assertConfigured();

    return new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        options,
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error) {
            this.logger.error(`Cloudinary upload stream failed: ${error.message}`, error);
            return reject(
              new ApiException(
                `Cloudinary upload failed: ${error.message}`,
                HttpStatus.BAD_GATEWAY,
                'CLOUDINARY_UPLOAD_ERROR',
                error
              )
            );
          }
          if (!result) {
            return reject(
              new ApiException(
                'Cloudinary upload failed with empty result',
                HttpStatus.BAD_GATEWAY,
                'CLOUDINARY_EMPTY_RESPONSE'
              )
            );
          }
          resolve(result);
        }
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Uploads a file from a URL or local file path.
   */
  async uploadFile(fileUrlOrPath: string, options: UploadApiOptions): Promise<UploadApiResponse> {
    this.assertConfigured();

    try {
      const result = await this.cloudinaryClient.uploader.upload(fileUrlOrPath, options);
      return result;
    } catch (error: any) {
      this.logger.error(`Cloudinary file upload failed: ${error.message}`, error);
      throw new ApiException(
        `Cloudinary upload failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
        'CLOUDINARY_UPLOAD_ERROR',
        error
      );
    }
  }

  /**
   * Deletes a media asset by public ID and resource type.
   */
  async destroy(
    publicId: string,
    options?: { resource_type?: 'image' | 'video' | 'raw'; invalidate?: boolean }
  ): Promise<{ result: string }> {
    this.assertConfigured();

    try {
      const result = await this.cloudinaryClient.uploader.destroy(publicId, {
        resource_type: options?.resource_type || 'image',
        invalidate: options?.invalidate ?? true,
      });

      return result;
    } catch (error: any) {
      this.logger.error(
        `Cloudinary delete failed for publicId=${publicId}: ${error.message}`,
        error
      );
      throw new ApiException(
        `Cloudinary deletion failed: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
        'CLOUDINARY_DELETE_ERROR',
        error
      );
    }
  }

  /**
   * Generates a secure signature for direct client-side uploads.
   * Parameters are signed using the server-side API Secret.
   */
  generateSignature(paramsToSign: Record<string, any>): {
    signature: string;
    timestamp: number;
  } {
    this.assertConfigured();

    const timestamp = paramsToSign.timestamp || Math.round(new Date().getTime() / 1000);
    const cleanedParams: Record<string, any> = { ...paramsToSign, timestamp };

    // Strip keys that should not be signed
    delete cleanedParams.file;
    delete cleanedParams.api_key;
    delete cleanedParams.resource_type;

    const signature = this.cloudinaryClient.utils.api_sign_request(
      cleanedParams,
      env.CLOUDINARY_API_SECRET!
    );

    return { signature, timestamp };
  }

  /**
   * Builds an authorized public Cloudinary delivery URL.
   */
  getPublicUrl(
    publicId: string,
    options?: {
      resourceType?: 'image' | 'video';
      format?: string;
      transformation?: any[];
    }
  ): string {
    this.assertConfigured();

    return this.cloudinaryClient.url(publicId, {
      resource_type: options?.resourceType || 'image',
      format: options?.format,
      transformation: options?.transformation,
      secure: true,
    });
  }
}
