import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiBody,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { AuditService } from '../audit/audit.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { Public } from '../../common/auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { UploadMediaDto } from './dto/upload-media.dto';
import { DeleteMediaDto } from './dto/delete-media.dto';
import { SignedUploadRequestDto } from './dto/signed-upload-request.dto';
import { SignedUploadResponseDto } from './dto/signed-upload-response.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { ReplaceMediaDto } from './dto/replace-media.dto';
import { MediaResourceType } from './interfaces/media.interface';

@ApiTags('Media')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('media')
@UseGuards(RolesGuard, ResourceOwnershipGuard)
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  @Post('upload/image')
  @Roles('admin', 'instructor')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image asset to Cloudinary (Admin/Instructor only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', example: 'techsprout/images/courses' },
        customIdentifier: { type: 'string', example: 'course-unity' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully', type: MediaResponseDto })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadMediaDto,
    @Req() req: AuthenticatedRequest
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new ApiException(
        'No file provided in form-data "file" field',
        HttpStatus.BAD_REQUEST,
        'NO_FILE_PROVIDED'
      );
    }

    const result = await this.mediaService.uploadImage(file, {
      folder: body.folder,
      customIdentifier: body.customIdentifier,
      uploaderId: req.user?.id,
    });

    await this.auditService.record({
      actorId: req.user?.id,
      action: 'MEDIA_IMAGE_UPLOADED',
      targetType: 'CLOUDINARY_IMAGE',
      targetId: result.publicId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      metadata: {
        folder: body.folder,
        format: result.format,
        bytes: result.bytes,
      },
    });

    return result;
  }

  @Post('upload/video')
  @Roles('admin', 'instructor')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a video asset to Cloudinary (Admin/Instructor only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', example: 'techsprout/videos/courses' },
        customIdentifier: { type: 'string', example: 'demo-video' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully', type: MediaResponseDto })
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadMediaDto,
    @Req() req: AuthenticatedRequest
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new ApiException(
        'No file provided in form-data "file" field',
        HttpStatus.BAD_REQUEST,
        'NO_FILE_PROVIDED'
      );
    }

    const result = await this.mediaService.uploadVideo(file, {
      folder: body.folder,
      customIdentifier: body.customIdentifier,
      uploaderId: req.user?.id,
    });

    await this.auditService.record({
      actorId: req.user?.id,
      action: 'MEDIA_VIDEO_UPLOADED',
      targetType: 'CLOUDINARY_VIDEO',
      targetId: result.publicId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      metadata: {
        folder: body.folder,
        format: result.format,
        bytes: result.bytes,
        duration: result.duration,
      },
    });

    return result;
  }

  @Post('signature')
  @Roles('admin', 'instructor')
  @ApiOperation({
    summary:
      'Generate signed upload parameters for direct client-to-Cloudinary upload (Admin/Instructor only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed parameters generated successfully',
    type: SignedUploadResponseDto,
  })
  async generateSignature(
    @Body() body: SignedUploadRequestDto,
    @Req() req: AuthenticatedRequest
  ): Promise<SignedUploadResponseDto> {
    const params = this.mediaService.getSignedUploadParameters(body);

    await this.auditService.record({
      actorId: req.user?.id,
      action: 'SIGNED_UPLOAD_GENERATED',
      targetType: 'CLOUDINARY_SIGNATURE',
      targetId: params.publicId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      metadata: {
        resourceType: params.resourceType,
        folder: params.folder,
      },
    });

    return params;
  }

  @Delete()
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a media asset from Cloudinary (Admin only)' })
  @ApiResponse({ status: 200, description: 'Media asset deleted successfully' })
  async deleteMedia(@Body() body: DeleteMediaDto, @Req() req: AuthenticatedRequest) {
    const result = await this.mediaService.deleteMedia(body.publicId, body.resourceType || 'image');

    await this.auditService.record({
      actorId: req.user?.id,
      action: 'MEDIA_DELETED',
      targetType: body.resourceType === 'video' ? 'CLOUDINARY_VIDEO' : 'CLOUDINARY_IMAGE',
      targetId: body.publicId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      metadata: {
        result: result.result,
      },
    });

    return result;
  }

  @Post('replace')
  @Roles('admin', 'instructor')
  @RequireOwnership('media', 'oldPublicId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Replace an existing media asset with a new one' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Media asset replaced successfully',
    type: MediaResponseDto,
  })
  async replaceMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ReplaceMediaDto,
    @Req() req: AuthenticatedRequest
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new ApiException(
        'No replacement file provided',
        HttpStatus.BAD_REQUEST,
        'NO_FILE_PROVIDED'
      );
    }
    const targetOldPublicId = body.oldPublicId || (req.query as any)?.oldPublicId;
    if (!targetOldPublicId) {
      throw new ApiException(
        'Existing oldPublicId must be provided for replacement',
        HttpStatus.BAD_REQUEST,
        'MISSING_OLD_PUBLIC_ID'
      );
    }

    const result = await this.mediaService.replaceMedia(
      targetOldPublicId,
      file,
      body.resourceType || 'image',
      {
        folder: body.folder,
        customIdentifier: body.customIdentifier,
        uploaderId: req.user?.id,
      }
    );

    await this.auditService.record({
      actorId: req.user?.id,
      action: 'MEDIA_REPLACED',
      targetType: body.resourceType === 'video' ? 'CLOUDINARY_VIDEO' : 'CLOUDINARY_IMAGE',
      targetId: result.publicId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      metadata: {
        oldPublicId: body.oldPublicId,
        newPublicId: result.publicId,
      },
    });

    return result;
  }

  @Get('url/*')
  @Public()
  @ApiOperation({ summary: 'Resolve public delivery URL for a Cloudinary public ID' })
  async getPublicUrl(
    @Param() params: Record<string, string>,
    @Query('resourceType') resourceType?: MediaResourceType,
    @Query('format') format?: string
  ) {
    const rawPublicId = params['0'] || '';
    const url = this.mediaService.getPublicUrl(rawPublicId, {
      resourceType,
      format,
    });
    return { publicId: rawPublicId, url };
  }
}
