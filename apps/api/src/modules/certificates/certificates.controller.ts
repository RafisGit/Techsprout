import {
  Controller,
  Get,
  Param,
  Req,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CertificateService } from './certificates.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { Public } from '../../common/auth/decorators/public.decorator';
import {
  certificateNumberSchema,
  mapToStudentCertificateDto,
  mapToPublicVerificationDto,
} from './dto/certificate.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Certificates')
@Controller()
export class CertificatesController {
  constructor(
    @Inject(CertificateService)
    private readonly certificateService: CertificateService
  ) {}

  @Get('courses/:courseId/certificate')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Get certificate for enrolled student upon course completion' })
  @ApiResponse({ status: 200, description: 'Certificate retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Course requirements not completed' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async getStudentCertificate(
    @Param('courseId') courseId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const studentId = req.user!.id;

    // 1. Query student enrollment
    const enrollment = await this.certificateService.getEnrollment(courseId, studentId);

    // Case A — No enrollment
    if (!enrollment) {
      throw new ApiException(
        'Enrollment not found for this course',
        HttpStatus.NOT_FOUND,
        'ENROLLMENT_NOT_FOUND'
      );
    }

    // 2. Check if a certificate already exists
    const existingCert = await this.certificateService.getCertificateByEnrollment(enrollment.id);

    // Case B — Enrollment exists + certificate already exists
    // Historical invariant: return existing certificate regardless of current enrollment status
    if (existingCert) {
      return {
        success: true,
        message:
          existingCert.status === 'REVOKED'
            ? 'Certificate has been administratively revoked'
            : 'Certificate retrieved successfully',
        data: mapToStudentCertificateDto(existingCert),
      };
    }

    // Case C — Enrollment exists + no certificate + enrollment COMPLETED
    if (enrollment.status === 'COMPLETED') {
      const issueResult = await this.certificateService.issueCertificateIfEligible(
        enrollment.id,
        {
          actorId: studentId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
        }
      );

      if (issueResult.status === 'ISSUED' || issueResult.status === 'ALREADY_EXISTS') {
        return {
          success: true,
          message: 'Certificate retrieved successfully',
          data: mapToStudentCertificateDto(issueResult.certificate),
        };
      }

      if (issueResult.status === 'NOT_ELIGIBLE') {
        throw new ApiException(
          issueResult.reason ||
            'You have not completed all requirements for this course. Complete all lessons and assessments to earn your certificate.',
          HttpStatus.FORBIDDEN,
          'COURSE_NOT_COMPLETED',
          issueResult.details
        );
      }

      if (issueResult.status === 'ENROLLMENT_NOT_FOUND') {
        throw new ApiException(
          'Enrollment not found',
          HttpStatus.NOT_FOUND,
          'ENROLLMENT_NOT_FOUND'
        );
      }

      throw new ApiException(
        issueResult.reason || 'Unable to issue certificate',
        HttpStatus.BAD_REQUEST,
        'INVALID_DOMAIN_STATE'
      );
    }

    // Case D — Enrollment exists + no certificate + enrollment not COMPLETED
    throw new ApiException(
      'You have not completed all requirements for this course. Complete all lessons and assessments to earn your certificate.',
      HttpStatus.FORBIDDEN,
      'COURSE_NOT_COMPLETED'
    );
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('certificates/verify/:certificateNumber')
  @ApiOperation({ summary: 'Public rate-limited certificate verification route' })
  @ApiResponse({ status: 200, description: 'Certificate verification result' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async verifyCertificate(
    @Param('certificateNumber') certificateNumber: string
  ) {
    const parseNumber = certificateNumberSchema.safeParse(certificateNumber);
    if (!parseNumber.success) {
      throw new ApiException(
        'Invalid certificate number format',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseNumber.error.flatten().fieldErrors
      );
    }

    const cert = await this.certificateService.getCertificateByNumber(parseNumber.data);
    if (!cert) {
      throw new ApiException(
        'Certificate not found',
        HttpStatus.NOT_FOUND,
        'CERTIFICATE_NOT_FOUND'
      );
    }

    return {
      success: true,
      message:
        cert.status === 'REVOKED'
          ? 'Certificate has been administratively revoked'
          : 'Certificate verification successful',
      data: mapToPublicVerificationDto(cert),
    };
  }
}
