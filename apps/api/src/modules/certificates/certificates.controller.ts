import {
  Controller,
  Get,
  Post,
  HttpCode,
  Param,
  Query,
  Req,
  Res,
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
import { Response } from 'express';
import { z } from 'zod';
import { CertificateService } from './certificates.service';
import { CertificatePdfService } from './certificate-pdf.service';
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
    private readonly certificateService: CertificateService,
    @Inject(CertificatePdfService)
    private readonly certificatePdfService: CertificatePdfService
  ) {}

  @Get('courses/:courseId/certificate/eligibility')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Check certificate eligibility for enrolled student' })
  @ApiResponse({ status: 200, description: 'Certificate eligibility evaluated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid course ID format' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getCertificateEligibility(
    @Param('courseId') courseId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const studentId = req.user!.id;
    const eligibility = await this.certificateService.getCertificateEligibility(courseId, studentId);
    return {
      success: true,
      message: 'Certificate eligibility evaluated successfully',
      data: eligibility,
    };
  }

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
    const studentId = req.user!.id;

    // Resolve course (supports UUID or slug)
    const course = await this.certificateService.resolveCourse(courseId);
    if (!course) {
      const isUuid = uuidSchema.safeParse(courseId).success;
      if (!isUuid) {
        throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
      }
      throw new ApiException(
        'Enrollment not found for this course',
        HttpStatus.NOT_FOUND,
        'ENROLLMENT_NOT_FOUND'
      );
    }

    // 1. Query student enrollment
    const enrollment = await this.certificateService.getEnrollment(course.id, studentId);

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

    // Case C — Enrollment exists + no certificate -> evaluate and issue
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

  @Get('courses/:courseId/certificate/download')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Download certificate PDF for enrolled student' })
  @ApiResponse({ status: 200, description: 'Certificate PDF file stream' })
  @ApiResponse({ status: 400, description: 'Invalid language or course ID' })
  @ApiResponse({ status: 403, description: 'Course requirements not completed or certificate revoked' })
  @ApiResponse({ status: 404, description: 'Enrollment or certificate not found' })
  async downloadCourseCertificatePdf(
    @Param('courseId') courseId: string,
    @Query('lang') rawLang: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    const studentId = req.user!.id;
    const lang = (rawLang || 'en').toLowerCase();
    if (lang !== 'en' && lang !== 'bn') {
      throw new ApiException(
        'Invalid language parameter. Allowed values: en, bn',
        HttpStatus.BAD_REQUEST,
        'INVALID_QUERY_PARAM'
      );
    }

    // 1. Resolve course (supports UUID or slug)
    const course = await this.certificateService.resolveCourse(courseId);
    if (!course) {
      const isUuid = uuidSchema.safeParse(courseId).success;
      if (!isUuid) {
        throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
      }
      throw new ApiException(
        'Enrollment not found for this course',
        HttpStatus.NOT_FOUND,
        'ENROLLMENT_NOT_FOUND'
      );
    }

    // 2. Query student enrollment
    const enrollment = await this.certificateService.getEnrollment(course.id, studentId);
    if (!enrollment) {
      throw new ApiException(
        'Enrollment not found for this course',
        HttpStatus.NOT_FOUND,
        'ENROLLMENT_NOT_FOUND'
      );
    }

    // 3. Resolve certificate (or issue if eligible)
    let cert = await this.certificateService.getCertificateByEnrollment(enrollment.id);
    if (!cert) {
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
        cert = issueResult.certificate;
      } else if (issueResult.status === 'NOT_ELIGIBLE') {
        throw new ApiException(
          issueResult.reason ||
            'You have not completed all requirements for this course. Complete all lessons and assessments to earn your certificate.',
          HttpStatus.FORBIDDEN,
          'COURSE_NOT_COMPLETED',
          issueResult.details
        );
      } else {
        throw new ApiException(
          issueResult.reason || 'Enrollment not found',
          HttpStatus.NOT_FOUND,
          'ENROLLMENT_NOT_FOUND'
        );
      }
    }

    if (cert.status === 'REVOKED') {
      throw new ApiException(
        'Certificate has been administratively revoked and cannot be downloaded',
        HttpStatus.BAD_REQUEST,
        'CERTIFICATE_REVOKED'
      );
    }

    // 4. Generate PDF buffer
    const pdfBuffer = await this.certificatePdfService.generateCertificatePdf({
      certificateNumber: cert.certificateNumber,
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      instructorName: cert.instructorName,
      completedAt: cert.completedAt,
      issuedAt: cert.issuedAt,
      finalScorePercentage: cert.finalScorePercentage,
      status: cert.status,
      language: lang as 'en' | 'bn',
    });

    const filename = `TechSprout-Certificate-${cert.certificateNumber}-${lang}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'private, no-transform, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.status(HttpStatus.OK).send(pdfBuffer);
  }

  @Get('certificates/:certificateNumber/download')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Download certificate PDF by certificate number' })
  @ApiResponse({ status: 200, description: 'Certificate PDF file stream' })
  @ApiResponse({ status: 400, description: 'Invalid language or certificate number' })
  @ApiResponse({ status: 403, description: 'Unauthorized to download this certificate' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async downloadCertificateByNumberPdf(
    @Param('certificateNumber') certificateNumber: string,
    @Query('lang') rawLang: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
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

    const lang = (rawLang || 'en').toLowerCase();
    if (lang !== 'en' && lang !== 'bn') {
      throw new ApiException(
        'Invalid language parameter. Allowed values: en, bn',
        HttpStatus.BAD_REQUEST,
        'INVALID_QUERY_PARAM'
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

    // Access control: only the certificate recipient student or an admin can download
    const studentId = req.user!.id;
    const userRole = ((req.user as any)?.role || '').toLowerCase();
    if (cert.studentId !== studentId && userRole !== 'admin') {
      throw new ApiException(
        'You do not have permission to download this certificate',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    if (cert.status === 'REVOKED') {
      throw new ApiException(
        'Certificate has been administratively revoked and cannot be downloaded',
        HttpStatus.BAD_REQUEST,
        'CERTIFICATE_REVOKED'
      );
    }

    const pdfBuffer = await this.certificatePdfService.generateCertificatePdf({
      certificateNumber: cert.certificateNumber,
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      instructorName: cert.instructorName,
      completedAt: cert.completedAt,
      issuedAt: cert.issuedAt,
      finalScorePercentage: cert.finalScorePercentage,
      status: cert.status,
      language: lang as 'en' | 'bn',
    });

    const filename = `TechSprout-Certificate-${cert.certificateNumber}-${lang}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'private, no-transform, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.status(HttpStatus.OK).send(pdfBuffer);
  }

  @Post('courses/:courseId/certificate/issue')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Issue certificate for eligible enrolled student' })
  @ApiResponse({ status: 200, description: 'Certificate issued or retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Course requirements not completed' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @HttpCode(HttpStatus.OK)
  async issueStudentCertificate(
    @Param('courseId') courseId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.getStudentCertificate(courseId, req);
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
