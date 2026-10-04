import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { PaymentsService } from './payments.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { Public } from '../../common/auth/decorators/public.decorator';
import { env } from '../../config/env.config';
import { initiatePaymentSchema } from './dto/initiate-payment.dto';
import {
  sslcommerzSuccessCallbackSchema,
  sslcommerzFailCallbackSchema,
  sslcommerzCancelCallbackSchema,
  sslcommerzIpnCallbackSchema,
} from './dto/callback.dto';
import { paymentListQuerySchema } from './dto/query-payments.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Initiate gateway payment session for an order' })
  @ApiResponse({ status: 201, description: 'Gateway session initiated successfully' })
  async initiatePayment(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = initiatePaymentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.paymentsService.initiatePayment(
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
      message: 'Payment session initiated successfully',
      data,
    };
  }

  @Public()
  @Post('sslcommerz/success')
  @ApiOperation({ summary: 'SSLCommerz browser success redirect callback' })
  async handleSuccessCallback(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    const parseResult = sslcommerzSuccessCallbackSchema.safeParse(body);
    const wantsJson =
      req.headers.accept?.includes('application/json') &&
      !req.headers.accept?.includes('text/html');

    if (!parseResult.success) {
      if (wantsJson) {
        throw new ApiException(
          'Validation failed',
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          parseResult.error.flatten().fieldErrors
        );
      }
      return res.redirect(
        `${env.WEB_ORIGIN}/orders/unknown/failure?reason=${encodeURIComponent('Invalid callback payload')}`
      );
    }

    try {
      const result = await this.paymentsService.processPaymentFulfillment(
        parseResult.data.tran_id,
        parseResult.data.val_id,
        parseResult.data as Record<string, unknown>,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
        }
      );

      const redirectUrl = `${env.WEB_ORIGIN}/orders/${result.order.id}/success`;

      if (wantsJson) {
        return res.status(HttpStatus.OK).json({
          success: true,
          message: result.isDuplicate
            ? 'Payment already fulfilled; duplicate callback ignored idempotently'
            : 'Payment fulfilled successfully',
          data: result.order,
          redirectUrl,
        });
      }

      return res.redirect(redirectUrl);
    } catch (err) {
      if (wantsJson) {
        throw err;
      }

      const reason = err instanceof ApiException ? err.message : 'Payment fulfillment failed';
      return res.redirect(
        `${env.WEB_ORIGIN}/orders/unknown/failure?reason=${encodeURIComponent(reason)}`
      );
    }
  }

  @Public()
  @Post('sslcommerz/fail')
  @ApiOperation({ summary: 'SSLCommerz browser failure redirect callback' })
  async handleFailCallback(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    const parseResult = sslcommerzFailCallbackSchema.safeParse(body);
    const wantsJson =
      req.headers.accept?.includes('application/json') &&
      !req.headers.accept?.includes('text/html');

    if (!parseResult.success) {
      if (wantsJson) {
        throw new ApiException(
          'Validation failed',
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          parseResult.error.flatten().fieldErrors
        );
      }
      return res.redirect(
        `${env.WEB_ORIGIN}/orders/unknown/failure?reason=${encodeURIComponent('Invalid callback payload')}`
      );
    }

    const failedReason = parseResult.data.failedreason || parseResult.data.error || 'Payment failed';

    try {
      const result = await this.paymentsService.handleFailCallback(
        parseResult.data.tran_id,
        failedReason,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
        }
      );

      const redirectUrl = `${env.WEB_ORIGIN}/orders/${result.orderId}/failure?reason=${encodeURIComponent(failedReason)}`;

      if (wantsJson) {
        return res.status(HttpStatus.OK).json({
          success: false,
          message: failedReason,
          orderId: result.orderId,
          redirectUrl,
        });
      }

      return res.redirect(redirectUrl);
    } catch (err) {
      if (wantsJson) {
        throw err;
      }
      return res.redirect(
        `${env.WEB_ORIGIN}/orders/unknown/failure?reason=${encodeURIComponent(failedReason)}`
      );
    }
  }

  @Public()
  @Post('sslcommerz/cancel')
  @ApiOperation({ summary: 'SSLCommerz browser cancellation redirect callback' })
  async handleCancelCallback(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    const parseResult = sslcommerzCancelCallbackSchema.safeParse(body);
    const wantsJson =
      req.headers.accept?.includes('application/json') &&
      !req.headers.accept?.includes('text/html');

    if (!parseResult.success) {
      if (wantsJson) {
        throw new ApiException(
          'Validation failed',
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          parseResult.error.flatten().fieldErrors
        );
      }
      return res.redirect(
        `${env.WEB_ORIGIN}/orders/unknown/cancelled`
      );
    }

    try {
      const result = await this.paymentsService.handleCancelCallback(
        parseResult.data.tran_id,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
        }
      );

      const redirectUrl = `${env.WEB_ORIGIN}/orders/${result.orderId}/cancelled`;

      if (wantsJson) {
        return res.status(HttpStatus.OK).json({
          success: false,
          message: 'Payment cancelled by user',
          orderId: result.orderId,
          redirectUrl,
        });
      }

      return res.redirect(redirectUrl);
    } catch (err) {
      if (wantsJson) {
        throw err;
      }
      return res.redirect(`${env.WEB_ORIGIN}/orders/unknown/cancelled`);
    }
  }

  @Public()
  @Post('sslcommerz/ipn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SSLCommerz server-to-server IPN callback' })
  async handleIpnCallback(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = sslcommerzIpnCallbackSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed for IPN payload',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const result = await this.paymentsService.processPaymentFulfillment(
      parseResult.data.tran_id,
      parseResult.data.val_id,
      parseResult.data as Record<string, unknown>,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      status: 'OK',
      message: result.isDuplicate
        ? 'Order already fulfilled'
        : 'IPN processed and order fulfilled successfully',
      orderId: result.order.id,
    };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'Get payment details by ID' })
  @ApiResponse({ status: 200, description: 'Payment retrieved successfully' })
  async getPaymentById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid payment ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.paymentsService.getPaymentById(id, {
      id: req.user!.id,
      role: req.user!.role,
      name: req.user!.name,
      email: req.user!.email,
    });

    return {
      success: true,
      message: 'Payment retrieved successfully',
      data,
    };
  }

  @Get()
  @ApiBearerAuth()
  @ApiCookieAuth('techsprout_session')
  @ApiOperation({ summary: 'List payments' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
  async listPayments(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = paymentListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.paymentsService.listPayments(
      {
        id: req.user!.id,
        role: req.user!.role,
      },
      parseResult.data
    );

    return {
      success: true,
      message: 'Payments retrieved successfully',
      data,
    };
  }
}
