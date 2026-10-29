import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { CloudinaryService } from '../media/cloudinary/cloudinary.service';
import { ApiException } from '../../common/errors/api-error';
import * as crypto from 'crypto';

export interface ValidatedUploadResult {
  detectedType: 'PDF' | 'ZIP';
  storageKey: string;
  fileUrl: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

@Injectable()
export class AssignmentUploadService {
  private readonly logger = new Logger(AssignmentUploadService.name);
  static readonly MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

  constructor(
    @Inject(CloudinaryService) private readonly cloudinaryService: CloudinaryService
  ) {}

  /**
   * Validates file signature (magic bytes), extension, MIME type, and size.
   */
  validateFile(file: Express.Multer.File): { detectedType: 'PDF' | 'ZIP'; safeFilename: string; mimeType: string } {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new ApiException('No file provided in form-data field', HttpStatus.BAD_REQUEST, 'NO_FILE_PROVIDED');
    }

    const actualBytes = file.buffer.length;
    if (actualBytes > AssignmentUploadService.MAX_FILE_SIZE_BYTES) {
      throw new ApiException('FILE_TOO_LARGE: File size exceeds the 25 MB maximum limit', HttpStatus.BAD_REQUEST, 'FILE_TOO_LARGE');
    }

    const rawName = file.originalname || 'submission';
    // Reject directory traversal attempts
    if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) {
      throw new ApiException('PATH_TRAVERSAL_REJECTED: Invalid filename path characters detected', HttpStatus.BAD_REQUEST, 'PATH_TRAVERSAL_REJECTED');
    }

    const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = safeFilename.split('.').pop()?.toLowerCase();

    if (ext !== 'pdf' && ext !== 'zip') {
      throw new ApiException('INVALID_FILE_EXTENSION: Only .pdf and .zip archives are permitted for assignment submissions', HttpStatus.BAD_REQUEST, 'INVALID_FILE_EXTENSION');
    }

    const buffer = file.buffer;

    // Check PDF magic bytes (%PDF- => 0x25, 0x50, 0x44, 0x46, 0x2D)
    const isPdf =
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d;

    // Check ZIP magic bytes (PK\x03\x04, PK\x05\x06, PK\x07\x08)
    const isZip =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08));

    if (ext === 'pdf' && !isPdf) {
      throw new ApiException('INVALID_FILE_SIGNATURE: Corrupted or invalid PDF file (magic bytes mismatch)', HttpStatus.BAD_REQUEST, 'INVALID_FILE_SIGNATURE');
    }

    if (ext === 'zip' && !isZip) {
      throw new ApiException('INVALID_FILE_SIGNATURE: Corrupted or invalid ZIP archive (magic bytes mismatch)', HttpStatus.BAD_REQUEST, 'INVALID_FILE_SIGNATURE');
    }

    const detectedType = isPdf ? 'PDF' : 'ZIP';
    const mimeType = isPdf ? 'application/pdf' : 'application/zip';

    return { detectedType, safeFilename, mimeType };
  }

  /**
   * Uploads the validated assignment file buffer to storage.
   */
  async uploadSubmissionFile(
    assignmentId: string,
    studentId: string,
    file: Express.Multer.File
  ): Promise<ValidatedUploadResult> {
    const { detectedType, safeFilename, mimeType } = this.validateFile(file);

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const timestamp = Date.now();
    const folder = `techsprout/assignments/${assignmentId}`;
    const publicId = `${studentId}_${timestamp}_${randomSuffix}`;
    const storageKey = `${folder}/${publicId}`;

    let fileUrl: string;

    if (this.cloudinaryService.isConfigured()) {
      try {
        const uploadResult = await this.cloudinaryService.uploadStream(file.buffer, {
          folder,
          public_id: publicId,
          resource_type: 'raw',
          overwrite: false,
        });
        fileUrl = uploadResult.secure_url;
      } catch (err: any) {
        this.logger.error(`Failed to upload assignment file to Cloudinary: ${err.message}`, err);
        throw new ApiException(
          `Cloud storage upload failed: ${err.message}`,
          HttpStatus.BAD_GATEWAY,
          'UPLOAD_FAILED'
        );
      }
    } else {
      // Graceful fallback for local test/dev environments without active Cloudinary credentials
      fileUrl = `https://storage.techsprout.local/assignments/${assignmentId}/${publicId}/${safeFilename}`;
    }

    return {
      detectedType,
      storageKey,
      fileUrl,
      originalFilename: safeFilename,
      mimeType,
      fileSizeBytes: file.buffer.length,
    };
  }
}
