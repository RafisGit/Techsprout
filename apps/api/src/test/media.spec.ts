import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MediaService } from '../modules/media/media.service';
import { CloudinaryService } from '../modules/media/cloudinary/cloudinary.service';
import { ApiException } from '../common/errors/api-error';
import { HttpStatus } from '@nestjs/common';
import { env } from '../config/env.config';

describe('Media & Cloudinary Service Test Suite', () => {
  let mediaService: MediaService;
  let cloudinaryService: CloudinaryService;
  let mockCloudinaryClient: any;

  beforeEach(() => {
    // Configure test environment variables for Cloudinary
    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    mockCloudinaryClient = {
      uploader: {
        upload_stream: vi.fn((options, callback) => {
          // Return a mock writable stream that simulates upload completion
          const { Writable } = require('stream');
          const mockStream = new Writable({
            write(chunk: any, encoding: any, cb: any) {
              cb();
            },
          });
          mockStream.on('finish', () => {
            callback(null, {
              public_id: options.folder
                ? `${options.folder}/${options.public_id || 'mock_asset'}`
                : options.public_id || 'mock_asset',
              secure_url: `https://res.cloudinary.com/test-cloud/${options.resource_type || 'image'}/upload/v123/${options.public_id || 'mock_asset'}.${options.resource_type === 'video' ? 'mp4' : 'jpg'}`,
              resource_type: options.resource_type || 'image',
              format: options.resource_type === 'video' ? 'mp4' : 'jpg',
              bytes: 102400,
              width: 1280,
              height: 720,
              duration: options.resource_type === 'video' ? 120.5 : undefined,
              created_at: '2026-09-29T10:00:00Z',
            });
          });
          return mockStream;
        }),
        destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
      },
      utils: {
        api_sign_request: vi.fn().mockReturnValue('mocked_sha1_signature_hash'),
      },
      url: vi.fn(
        (publicId, opts) =>
          `https://res.cloudinary.com/test-cloud/${opts?.resource_type || 'image'}/upload/${publicId}`
      ),
      config: vi.fn(),
    };

    cloudinaryService = new CloudinaryService(mockCloudinaryClient);
    mediaService = new MediaService(cloudinaryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. Cloudinary Configuration & Missing Credentials
  // ==========================================
  describe('1. Configuration & Missing Credentials', () => {
    it('should confirm configured when credentials are set', () => {
      expect(cloudinaryService.isConfigured()).toBe(true);
      expect(cloudinaryService.getCloudName()).toBe('test-cloud');
      expect(cloudinaryService.getApiKey()).toBe('test-api-key');
      expect(cloudinaryService.getApiSecret()).toBe('test-api-secret-12345');
    });

    it('should throw CLOUDINARY_NOT_CONFIGURED when credentials are missing', async () => {
      env.CLOUDINARY_CLOUD_NAME = undefined;
      env.CLOUDINARY_API_KEY = undefined;
      env.CLOUDINARY_API_SECRET = undefined;

      expect(cloudinaryService.isConfigured()).toBe(false);

      const fakeBuffer = Buffer.from('fake image content');
      await expect(
        cloudinaryService.uploadStream(fakeBuffer, { resource_type: 'image' })
      ).rejects.toThrow(ApiException);

      try {
        await cloudinaryService.uploadStream(fakeBuffer, { resource_type: 'image' });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(err.errorCode).toBe('CLOUDINARY_NOT_CONFIGURED');
      }
    });
  });

  // ==========================================
  // 2. Image Upload
  // ==========================================
  describe('2. Image Upload Service', () => {
    it('should successfully upload an image with resource_type="image" and conventional folder', async () => {
      const mockImageBuffer = Buffer.from('mock image binary data');
      const result = await mediaService.uploadImage(
        {
          buffer: mockImageBuffer,
          mimetype: 'image/png',
          originalname: 'course-unity-thumb.png',
        },
        {
          folder: 'techsprout/images/courses',
          customIdentifier: 'unity-game-thumb',
        }
      );

      expect(result.resourceType).toBe('image');
      expect(result.format).toBe('jpg');
      expect(result.secureUrl).toContain('https://res.cloudinary.com/test-cloud/image/upload');
      expect(result.publicId).toContain('techsprout/images/courses/unity-game-thumb_');
      expect(result.bytes).toBe(102400);

      // Verify cloudinary client call
      expect(mockCloudinaryClient.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'techsprout/images/courses',
          resource_type: 'image',
        }),
        expect.any(Function)
      );
    });

    it('should use default folder techsprout/images/site when none specified', async () => {
      const result = await mediaService.uploadImage({
        buffer: Buffer.from('test data'),
        mimetype: 'image/webp',
        originalname: 'site-banner.webp',
      });

      expect(result.publicId).toContain('techsprout/images/site');
    });

    it('should prepend allowed prefix if folder does not follow naming convention', async () => {
      const result = await mediaService.uploadImage(
        {
          buffer: Buffer.from('test data'),
          mimetype: 'image/jpeg',
          originalname: 'category.jpg',
        },
        { folder: 'categories/marketing' }
      );

      expect(result.publicId).toContain('techsprout/images/categories/marketing');
    });
  });

  // ==========================================
  // 3. Video Upload
  // ==========================================
  describe('3. Video Upload Service', () => {
    it('should successfully upload a video with resource_type="video" and duration metadata', async () => {
      const mockVideoBuffer = Buffer.from('mock video binary data stream');
      const result = await mediaService.uploadVideo(
        {
          buffer: mockVideoBuffer,
          mimetype: 'video/mp4',
          originalname: 'intro-lesson.mp4',
        },
        {
          folder: 'techsprout/videos/lessons',
          customIdentifier: 'lesson-01-intro',
        }
      );

      expect(result.resourceType).toBe('video');
      expect(result.format).toBe('mp4');
      expect(result.duration).toBe(120.5);
      expect(result.secureUrl).toContain('https://res.cloudinary.com/test-cloud/video/upload');
      expect(result.publicId).toContain('techsprout/videos/lessons/lesson-01-intro_');

      expect(mockCloudinaryClient.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'techsprout/videos/lessons',
          resource_type: 'video',
        }),
        expect.any(Function)
      );
    });

    it('should use default video folder techsprout/videos/courses when none specified', async () => {
      const result = await mediaService.uploadVideo({
        buffer: Buffer.from('video data'),
        mimetype: 'video/webm',
        originalname: 'course-promo.webm',
      });

      expect(result.publicId).toContain('techsprout/videos/courses');
    });
  });

  // ==========================================
  // 4. File Validation & Error Handling
  // ==========================================
  describe('4. File Validation & Size Limits', () => {
    it('should reject unsupported image MIME types', async () => {
      await expect(
        mediaService.uploadImage({
          buffer: Buffer.from('pdf data'),
          mimetype: 'application/pdf',
          originalname: 'document.pdf',
        })
      ).rejects.toThrow(ApiException);

      try {
        await mediaService.uploadImage({
          buffer: Buffer.from('pdf data'),
          mimetype: 'application/pdf',
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(err.errorCode).toBe('INVALID_IMAGE_TYPE');
      }
    });

    it('should reject unsupported video MIME types', async () => {
      await expect(
        mediaService.uploadVideo({
          buffer: Buffer.from('audio data'),
          mimetype: 'audio/mp3',
          originalname: 'soundtrack.mp3',
        })
      ).rejects.toThrow(ApiException);

      try {
        await mediaService.uploadVideo({
          buffer: Buffer.from('audio data'),
          mimetype: 'audio/mp3',
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(err.errorCode).toBe('INVALID_VIDEO_TYPE');
      }
    });

    it('should reject images larger than MAX_IMAGE_SIZE_BYTES (10MB)', async () => {
      const oversizeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      await expect(
        mediaService.uploadImage({
          buffer: oversizeBuffer,
          mimetype: 'image/png',
          size: oversizeBuffer.length,
        })
      ).rejects.toThrow(ApiException);

      try {
        await mediaService.uploadImage({
          buffer: oversizeBuffer,
          mimetype: 'image/png',
          size: oversizeBuffer.length,
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(err.errorCode).toBe('FILE_TOO_LARGE');
      }
    });

    it('should reject videos larger than MAX_VIDEO_SIZE_BYTES (100MB)', async () => {
      const oversizeVideo = Buffer.alloc(101 * 1024 * 1024); // 101MB
      await expect(
        mediaService.uploadVideo({
          buffer: oversizeVideo,
          mimetype: 'video/mp4',
          size: oversizeVideo.length,
        })
      ).rejects.toThrow(ApiException);

      try {
        await mediaService.uploadVideo({
          buffer: oversizeVideo,
          mimetype: 'video/mp4',
          size: oversizeVideo.length,
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(err.errorCode).toBe('FILE_TOO_LARGE');
      }
    });

    it('should reject invalid or malicious public IDs containing path traversal', async () => {
      await expect(mediaService.deleteImage('../../etc/passwd')).rejects.toThrow(ApiException);

      try {
        await mediaService.deleteImage('../../etc/passwd');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(err.errorCode).toBe('INVALID_PUBLIC_ID');
      }
    });
  });

  // ==========================================
  // 5. Deletion & Replacement
  // ==========================================
  describe('5. Deletion & Replacement Operations', () => {
    it('should delete an image asset with resource_type="image"', async () => {
      const result = await mediaService.deleteImage('techsprout/images/courses/sample_123');

      expect(result.publicId).toBe('techsprout/images/courses/sample_123');
      expect(result.result).toBe('ok');
      expect(result.resourceType).toBe('image');

      expect(mockCloudinaryClient.uploader.destroy).toHaveBeenCalledWith(
        'techsprout/images/courses/sample_123',
        expect.objectContaining({
          resource_type: 'image',
          invalidate: true,
        })
      );
    });

    it('should delete a video asset with resource_type="video"', async () => {
      const result = await mediaService.deleteVideo('techsprout/videos/lessons/lesson_123');

      expect(result.publicId).toBe('techsprout/videos/lessons/lesson_123');
      expect(result.result).toBe('ok');
      expect(result.resourceType).toBe('video');

      expect(mockCloudinaryClient.uploader.destroy).toHaveBeenCalledWith(
        'techsprout/videos/lessons/lesson_123',
        expect.objectContaining({
          resource_type: 'video',
          invalidate: true,
        })
      );
    });

    it('should replace an existing media asset by uploading new and destroying old', async () => {
      const newFile = {
        buffer: Buffer.from('new image content'),
        mimetype: 'image/jpeg',
        originalname: 'new-course.jpg',
      };

      const result = await mediaService.replaceMedia(
        'techsprout/images/courses/old_thumb_123',
        newFile,
        'image',
        { folder: 'techsprout/images/courses' }
      );

      expect(result.secureUrl).toBeDefined();
      expect(mockCloudinaryClient.uploader.destroy).toHaveBeenCalledWith(
        'techsprout/images/courses/old_thumb_123',
        expect.objectContaining({ resource_type: 'image' })
      );
    });
  });

  // ==========================================
  // 6. Direct Signed Upload (Video & Large Asset Architecture)
  // ==========================================
  describe('6. Direct Signed Upload Parameter Generation', () => {
    it('should generate valid signed upload parameters without exposing the secret', () => {
      const result = mediaService.getSignedUploadParameters({
        resourceType: 'video',
        folder: 'techsprout/videos/lessons',
        filename: 'intro-lesson.mp4',
      });

      expect(result.signature).toBe('mocked_sha1_signature_hash');
      expect(result.apiKey).toBe('test-api-key');
      expect(result.cloudName).toBe('test-cloud');
      expect(result.folder).toBe('techsprout/videos/lessons');
      expect(result.resourceType).toBe('video');
      expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/test-cloud/video/upload');
      expect(result.timestamp).toBeDefined();

      // Crucial: Secret is NEVER present in returned params
      expect((result as any).apiSecret).toBeUndefined();
      expect((result as any).api_secret).toBeUndefined();

      // Cloudinary signer must have been invoked with secret
      expect(mockCloudinaryClient.utils.api_sign_request).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'techsprout/videos/lessons',
        }),
        'test-api-secret-12345'
      );
    });
  });

  // ==========================================
  // 7. Error Handling for Cloudinary API Failures
  // ==========================================
  describe('7. Cloudinary Failure Handling', () => {
    it('should gracefully handle Cloudinary upload stream failure', async () => {
      mockCloudinaryClient.uploader.upload_stream = vi.fn((_opts, callback) => {
        const { Writable } = require('stream');
        const errStream = new Writable({
          write(_chunk: any, _enc: any, cb: any) {
            cb();
          },
        });
        errStream.on('finish', () => {
          callback(new Error('Cloudinary server unavailable (500)'));
        });
        return errStream;
      });

      await expect(
        mediaService.uploadImage({
          buffer: Buffer.from('test binary'),
          mimetype: 'image/png',
        })
      ).rejects.toThrow(ApiException);
    });

    it('should gracefully handle Cloudinary destroy API failure', async () => {
      mockCloudinaryClient.uploader.destroy = vi
        .fn()
        .mockRejectedValue(new Error('Network timeout'));

      await expect(mediaService.deleteImage('techsprout/images/site/bad_asset')).rejects.toThrow(
        ApiException
      );
    });
  });
});
