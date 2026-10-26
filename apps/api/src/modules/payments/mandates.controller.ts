import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { MandatesService } from './mandates.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { Public } from '../../common/auth/decorators/public.decorator';
import {
  initiateMandateSchema,
  mandateCallbackSchema,
} from '@techsprout/contracts';

const uuidSchema = z.string().uuid('Invalid mandate ID format');

@ApiTags('Payment Mandates')
@Controller('payments/mandates')
export class MandatesController {
  constructor(@Inject(MandatesService) private readonly mandatesService: MandatesService) {}

  @Post('initiate')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Initiate gateway recurring payment mandate registration' })
  @ApiResponse({ status: 201, description: 'Mandate registration initiated' })
  async initiateMandate(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = initiateMandateSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.mandatesService.initiateMandate(
      req.user!.id,
      parseResult.data,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Mandate registration initiated successfully',
      data,
    };
  }

  @Public()
  @Post('callback')
  @ApiOperation({ summary: 'Provider callback for mandate registration' })
  @ApiResponse({ status: 200, description: 'Mandate callback processed' })
  async handleMandateCallback(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = mandateCallbackSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const result = await this.mandatesService.processMandateCallback(parseResult.data, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
    });

    return {
      success: true,
      message: result.isDuplicate
        ? 'Duplicate callback ignored idempotently'
        : 'Mandate registration processed successfully',
      data: result.mandate,
    };
  }

  @Get()
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Get current user active and stored payment mandates' })
  async listUserMandates(@Req() req: AuthenticatedRequest) {
    const data = await this.mandatesService.getStudentMandates(req.user!.id);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Get a specific payment mandate by ID' })
  async getMandateById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      throw new ApiException('Invalid mandate ID', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const isAdmin = req.user?.role === 'ADMIN';
    const data = await this.mandatesService.getMandateById(idResult.data, req.user!.id, isAdmin);

    return {
      success: true,
      data,
    };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Revoke a stored payment mandate' })
  async revokeMandate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      throw new ApiException('Invalid mandate ID', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const isAdmin = req.user?.role === 'ADMIN';
    const data = await this.mandatesService.revokeMandate(
      idResult.data,
      req.user!.id,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      },
      isAdmin
    );

    return {
      success: true,
      message: 'Payment mandate revoked successfully',
      data,
    };
  }
}
