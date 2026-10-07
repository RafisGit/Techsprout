import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'stream';
import { formatMinorUnits } from '@techsprout/contracts';

export const ORDERS_CSV_HEADERS = [
  'Order Number',
  'Order ID',
  'Date Created (UTC)',
  'Date Paid (UTC)',
  'Status',
  'Student Name',
  'Student Email',
  'Course Title',
  'Subtotal (Cents)',
  'Subtotal (BDT)',
  'Discount (BDT)',
  'Payable (BDT)',
  'Currency',
  'Payment Method',
  'Bank Transaction ID',
  'Invoice Number',
];

export const REFUNDS_CSV_HEADERS = [
  'Refund Number',
  'Refund ID',
  'Order Number',
  'Order ID',
  'Status',
  'Amount (Cents)',
  'Amount (BDT)',
  'Currency',
  'Reason',
  'Provider Reference',
  'Processed By Admin',
  'Student Name',
  'Student Email',
  'Course Title',
  'Processed Date (UTC)',
  'Date Created (UTC)',
];

export const RECONCILIATION_CSV_HEADERS = [
  'Discrepancy ID',
  'Order Number',
  'Order ID',
  'Discrepancy Type',
  'Description',
  'Internal Payable (Cents)',
  'Internal Payable (BDT)',
  'Gateway Amount (Cents)',
  'Gateway Amount (BDT)',
  'Auto Resolvable',
  'Detected Date (UTC)',
];

@Injectable()
export class FinanceCsvService {
  private readonly logger = new Logger(FinanceCsvService.name);

  /**
   * Escape individual cell per RFC 4180:
   * - If cell contains comma, double-quote, or newline (\n, \r), wrap in double quotes.
   * - Escape internal double-quotes by doubling them ("").
   */
  public escapeCsvCell(val: unknown): string {
    if (val === null || val === undefined) {
      return '';
    }
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Format an array of cell values into a single RFC 4180 CSV line with CRLF line ending.
   */
  public formatRow(row: unknown[]): string {
    return row.map((cell) => this.escapeCsvCell(cell)).join(',') + '\r\n';
  }

  /**
   * Generates a safe, deterministic filename for the CSV download.
   */
  public getSafeFilename(type: string, startDate: Date, endDate: Date): string {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const sanitizedType = type.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `techsprout-${sanitizedType}-${startStr}-to-${endStr}.csv`;
  }

  /**
   * Stream CSV data to a PassThrough stream chunk-by-chunk.
   * Prepends UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility.
   */
  public async streamRows<T>(
    outputStream: PassThrough,
    headers: string[],
    records: T[] | AsyncIterable<T>,
    mapper: (item: T) => unknown[]
  ): Promise<number> {
    let rowCount = 0;
    try {
      // 1. Write UTF-8 BOM + Header row
      const headerLine = '\uFEFF' + this.formatRow(headers);
      outputStream.write(headerLine);

      // 2. Stream records
      if (Symbol.asyncIterator in Object(records)) {
        for await (const record of records as AsyncIterable<T>) {
          const rowData = mapper(record);
          outputStream.write(this.formatRow(rowData));
          rowCount++;
        }
      } else {
        for (const record of records as T[]) {
          const rowData = mapper(record);
          outputStream.write(this.formatRow(rowData));
          rowCount++;
        }
      }

      outputStream.end();
    } catch (err) {
      this.logger.error(`Error during CSV streaming: ${(err as Error).message}`, (err as Error).stack);
      outputStream.destroy(err as Error);
      throw err;
    }

    return rowCount;
  }
}
