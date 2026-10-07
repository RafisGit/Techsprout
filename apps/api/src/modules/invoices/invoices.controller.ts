import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  HttpStatus,
  Inject,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { z } from 'zod';
import { InvoicesService } from './invoices.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { invoiceListQuerySchema } from './dto/query-invoices.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Invoices')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('invoices')
export class InvoicesController {
  constructor(@Inject(InvoicesService) private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices for authenticated student' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  async listMyInvoices(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = invoiceListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.invoicesService.listStudentInvoices(req.user!.id, parseResult.data);

    return {
      success: true,
      message: 'Invoices retrieved successfully',
      data,
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download invoice PDF by ID (Student owner or Admin)' })
  @ApiResponse({ status: 200, description: 'Invoice PDF stream' })
  async downloadInvoicePdf(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid invoice ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const { stream, filename } = await this.invoicesService.getInvoicePdfStream(
      id,
      {
        id: req.user!.id,
        role: req.user!.role,
      },
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(stream);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice details by ID (Student owner or Admin)' })
  @ApiResponse({ status: 200, description: 'Invoice retrieved successfully' })
  async getInvoiceById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid invoice ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.invoicesService.getInvoiceById(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Invoice retrieved successfully',
      data,
    };
  }
}
