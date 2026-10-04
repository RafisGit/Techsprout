import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, or, desc, gte, lte, count, ilike } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { invoices, Invoice } from '../../database/schema';
import { ApiException } from '../../common/errors/api-error';
import {
  InvoiceDto,
  InvoiceListItemDto,
  InvoiceListQuery,
  PaginatedInvoicesData,
} from '@techsprout/contracts';

export interface UserContext {
  id: string;
  role: string;
}

@Injectable()
export class InvoicesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /**
   * Format persisted database invoice into immutable financial snapshot DTO.
   * Historical fields are returned directly from the invoice record without live catalog joins.
   */
  public formatInvoiceDto(inv: Invoice): InvoiceDto {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      orderId: inv.orderId,
      studentId: inv.studentId,
      studentName: inv.studentName,
      studentEmail: inv.studentEmail,
      studentPhone: inv.studentPhone ?? null,
      courseTitle: inv.courseTitle,
      subtotalCents: inv.subtotalCents,
      discountCents: inv.discountCents,
      payableCents: inv.payableCents,
      currency: inv.currency as 'BDT',
      paymentMethod: inv.paymentMethod,
      bankTranId: inv.bankTranId,
      status: inv.status,
      issuedAt: inv.issuedAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    };
  }

  /**
   * Format invoice for paginated summary lists.
   */
  public formatInvoiceListItemDto(inv: Invoice): InvoiceListItemDto {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      orderId: inv.orderId,
      studentId: inv.studentId,
      studentName: inv.studentName,
      studentEmail: inv.studentEmail,
      courseTitle: inv.courseTitle,
      payableCents: inv.payableCents,
      currency: inv.currency as 'BDT',
      status: inv.status,
      issuedAt: inv.issuedAt.toISOString(),
    };
  }

  /**
   * Get single invoice by ID with strict ownership authorization.
   * Student may access only their own invoice; Admin may access any invoice.
   */
  async getInvoiceById(invoiceId: string, user: UserContext): Promise<InvoiceDto> {
    const [inv] = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!inv) {
      throw new ApiException('Invoice not found', HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND');
    }

    if (user.role !== 'admin' && inv.studentId !== user.id) {
      throw new ApiException(
        'Access denied: cannot view another student invoice',
        HttpStatus.FORBIDDEN,
        'INVOICE_ACCESS_DENIED'
      );
    }

    return this.formatInvoiceDto(inv);
  }

  /**
   * List paginated invoices for authenticated student.
   * Scoped strictly to invoice.studentId === authenticatedUser.id.
   */
  async listStudentInvoices(
    studentId: string,
    query: InvoiceListQuery
  ): Promise<PaginatedInvoicesData> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const whereConditions = [eq(invoices.studentId, studentId)];

    if (query.status) {
      whereConditions.push(eq(invoices.status, query.status));
    }
    if (query.orderId) {
      whereConditions.push(eq(invoices.orderId, query.orderId));
    }
    if (query.startDate) {
      whereConditions.push(gte(invoices.issuedAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      whereConditions.push(lte(invoices.issuedAt, new Date(query.endDate)));
    }
    if (query.search) {
      const searchPattern = `%${query.search.trim()}%`;
      const searchOr = or(
        ilike(invoices.invoiceNumber, searchPattern),
        ilike(invoices.courseTitle, searchPattern)
      );
      if (searchOr) {
        whereConditions.push(searchOr);
      }
    }

    const whereClause = and(...whereConditions);

    const [totalRes] = await this.db
      .select({ count: count(invoices.id) })
      .from(invoices)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await this.db
      .select()
      .from(invoices)
      .where(whereClause)
      .orderBy(desc(invoices.issuedAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map((inv) => this.formatInvoiceListItemDto(inv)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * List paginated invoices across all students for administrators.
   */
  async listAdminInvoices(query: InvoiceListQuery): Promise<PaginatedInvoicesData> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const whereConditions = [];

    if (query.status) {
      whereConditions.push(eq(invoices.status, query.status));
    }
    if (query.orderId) {
      whereConditions.push(eq(invoices.orderId, query.orderId));
    }
    if (query.startDate) {
      whereConditions.push(gte(invoices.issuedAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      whereConditions.push(lte(invoices.issuedAt, new Date(query.endDate)));
    }
    if (query.search) {
      const searchPattern = `%${query.search.trim()}%`;
      const searchOr = or(
        ilike(invoices.invoiceNumber, searchPattern),
        ilike(invoices.studentName, searchPattern),
        ilike(invoices.studentEmail, searchPattern),
        ilike(invoices.courseTitle, searchPattern)
      );
      if (searchOr) {
        whereConditions.push(searchOr);
      }
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [totalRes] = await this.db
      .select({ count: count(invoices.id) })
      .from(invoices)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await this.db
      .select()
      .from(invoices)
      .where(whereClause)
      .orderBy(desc(invoices.issuedAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map((inv) => this.formatInvoiceListItemDto(inv)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
