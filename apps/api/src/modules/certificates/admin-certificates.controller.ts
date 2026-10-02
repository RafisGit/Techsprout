import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  HttpStatus,
  HttpCode,
  UseGuards,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CertificateService } from './certificates.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  adminQueryCertificatesSchema,
  revokeCertificateSchema,
  mapToAdminCertificateDto,
} from './dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Certificates')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/certificates')
export class AdminCertificatesController {
  constructor(
    @Inject(CertificateService)
    private readonly certificateService: CertificateService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List certificates with administrative pagination and filters' })
  @ApiResponse({ status: 200, description: 'Certificates retrieved successfully' })
  async listCertificates(
    @Query() query: unknown
  ) {
    const parseQuery = adminQueryCertificatesSchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.certificateService.listCertificates(parseQuery.data);

    return {
      success: true,
      message: 'Certificates retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get administrative certificate detail by ID' })
  @ApiResponse({ status: 200, description: 'Certificate detail retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async getCertificateDetail(
    @Param('id') id: string
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid certificate ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const cert = await this.certificateService.getCertificateById(parseId.data);
    if (!cert) {
      throw new ApiException('Certificate not found', HttpStatus.NOT_FOUND, 'CERTIFICATE_NOT_FOUND');
    }

    return {
      success: true,
      message: 'Certificate detail retrieved successfully',
      data: mapToAdminCertificateDto(cert),
    };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Administratively revoke an issued certificate' })
  @ApiResponse({ status: 200, description: 'Certificate successfully revoked' })
  @ApiResponse({ status: 400, description: 'Invalid revocation reason' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  @ApiResponse({ status: 409, description: 'Certificate is already revoked' })
  async revokeCertificate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid certificate ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseBody = revokeCertificateSchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const updated = await this.certificateService.revokeCertificate(
      parseId.data,
      parseBody.data.reason,
      {
        actorId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Certificate revoked successfully',
      data: mapToAdminCertificateDto(updated),
    };
  }
}
