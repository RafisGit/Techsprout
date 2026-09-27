import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../http/correlation-id.middleware';
import { ApiException } from './api-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    const requestId = request.id || 'unknown';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal server error occurred';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let details: unknown = undefined;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      message = exception.message;
      errorCode = exception.errorCode;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj['message'] as string) || exception.message;
        errorCode = (resObj['error'] as string) || 'HTTP_ERROR';
      }
    } else if (exception instanceof Error) {
      // Don't leak raw database/internal error messages in production
      this.logger.error(`[${requestId}] Unhandled exception: ${exception.message}`, exception.stack);
      message = 'An unexpected error occurred while processing your request';
      errorCode = 'SERVER_ERROR';
    }

    response.status(status).json({
      success: false,
      message,
      errorCode,
      statusCode: status,
      timestamp: new Date().toISOString(),
      requestId,
      ...(details ? { details } : {}),
    });
  }
}
