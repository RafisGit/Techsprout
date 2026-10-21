import {
  Controller,
  Post,
  Body,
  Req,
  HttpStatus,
  HttpCode,
  Inject,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  ingestTelemetryBatchSchema,
  telemetryEventSchema,
  TelemetryEventDto,
} from './dto/telemetry.dto';

@ApiTags('Learning Telemetry')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('learning/events')
export class TelemetryController {
  private readonly logger = new Logger(TelemetryController.name);

  constructor(@Inject(TelemetryService) private readonly telemetryService: TelemetryService) {}

  @Post('')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest a batch of learning telemetry events' })
  @ApiResponse({ status: 200, description: 'Events ingested or processed idempotently' })
  @ApiResponse({ status: 400, description: 'Validation failed, payload too large, or bounded constraints violated' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Active course enrollment required' })
  @ApiResponse({ status: 409, description: 'Idempotency conflict (different payload for existing event ID)' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async ingestEvents(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    // 1. Measure and enforce raw payload size ceiling (32KB)
    const contentLength = req.headers['content-length']
      ? parseInt(req.headers['content-length'] as string, 10)
      : undefined;

    let rawPayloadBytes: number;
    if (contentLength !== undefined && !isNaN(contentLength)) {
      rawPayloadBytes = contentLength;
    } else {
      const rawPayloadString = typeof body === 'string' ? body : JSON.stringify(body);
      rawPayloadBytes = Buffer.byteLength(rawPayloadString, 'utf8');
    }

    if (rawPayloadBytes > 32 * 1024) {
      throw new ApiException(
        'Batch payload exceeds maximum size of 32KB',
        HttpStatus.BAD_REQUEST,
        'PAYLOAD_TOO_LARGE'
      );
    }

    // 2. Parse and validate against strict allowlisted schema
    let parsedBody = body;
    if (typeof body === 'string') {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        throw new ApiException(
          'Malformed JSON payload',
          HttpStatus.BAD_REQUEST,
          'INVALID_JSON'
        );
      }
    }

    const parseResult = ingestTelemetryBatchSchema.safeParse(parsedBody);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed: Unapproved fields or invalid telemetry format',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    // 3. Ingest events through service pipeline
    const result = await this.telemetryService.ingestBatch(
      parseResult.data.events,
      {
        id: req.user!.id,
        role: req.user!.role,
      },
      rawPayloadBytes
    );

    return {
      success: true,
      message: result.message || 'Telemetry batch processed successfully',
      data: result,
    };
  }

  @Post('beacon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest exit telemetry beacon from navigator.sendBeacon' })
  @ApiResponse({ status: 200, description: 'Beacon events processed' })
  @ApiResponse({ status: 400, description: 'Invalid beacon payload format' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Active course enrollment required' })
  async ingestBeacon(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const rawPayloadString = typeof body === 'string' ? body : JSON.stringify(body);
    const rawPayloadBytes = Buffer.byteLength(rawPayloadString, 'utf8');

    if (rawPayloadBytes > 32 * 1024) {
      throw new ApiException(
        'Batch payload exceeds maximum size of 32KB',
        HttpStatus.BAD_REQUEST,
        'PAYLOAD_TOO_LARGE'
      );
    }

    let parsed: unknown = body;
    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ApiException(
          'Malformed JSON payload in beacon',
          HttpStatus.BAD_REQUEST,
          'INVALID_JSON'
        );
      }
    }

    // Normalize single event or batch array to TelemetryEventDto[]
    let eventsToProcess: TelemetryEventDto[];

    if (Array.isArray(parsed)) {
      eventsToProcess = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      if ('events' in parsed && Array.isArray((parsed as any).events)) {
        eventsToProcess = (parsed as any).events;
      } else {
        // Single event wrapped into array
        eventsToProcess = [parsed as TelemetryEventDto];
      }
    } else {
      throw new ApiException(
        'Invalid beacon payload structure',
        HttpStatus.BAD_REQUEST,
        'INVALID_PAYLOAD'
      );
    }

    const batchParseResult = ingestTelemetryBatchSchema.safeParse({ events: eventsToProcess });
    if (!batchParseResult.success) {
      throw new ApiException(
        'Validation failed: Unapproved fields or invalid beacon telemetry format',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        batchParseResult.error.flatten().fieldErrors
      );
    }

    const result = await this.telemetryService.ingestBatch(
      batchParseResult.data.events,
      {
        id: req.user!.id,
        role: req.user!.role,
      },
      rawPayloadBytes
    );

    return {
      success: true,
      message: result.message || 'Telemetry beacon processed successfully',
      data: result,
    };
  }
}
