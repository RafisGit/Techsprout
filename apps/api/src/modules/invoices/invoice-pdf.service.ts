import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { Invoice } from '../../database/schema';
import { formatMinorUnits } from '@techsprout/contracts';

export interface InvoicePdfData {
  invoice: Invoice;
  orderNumber: string;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  /**
   * Generates a safe, deterministic filename for the invoice PDF.
   * Prevents user-controlled path traversal or unsafe characters.
   */
  public getSafeFilename(invoiceNumber: string): string {
    const sanitized = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${sanitized}.pdf`;
  }

  /**
   * Generates invoice PDF document and returns a Buffer (useful for tests or binary inspection).
   */
  public async generatePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = this.createDocument(data);
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      this.renderContent(doc, data);
      doc.end();
    });
  }

  /**
   * Streams invoice PDF directly to a Node.js PassThrough / Writable stream.
   */
  public generatePdfStream(data: InvoicePdfData, outputStream: NodeJS.WritableStream): void {
    const doc = this.createDocument(data);
    doc.pipe(outputStream);
    this.renderContent(doc, data);
    doc.end();
  }

  /**
   * Returns a PassThrough stream ready for StreamableFile consumption in NestJS.
   */
  public createStream(data: InvoicePdfData): PassThrough {
    const stream = new PassThrough();
    this.generatePdfStream(data, stream);
    return stream;
  }

  private createDocument(data: InvoicePdfData): PDFKit.PDFDocument {
    return new PDFDocument({
      size: 'A4',
      margin: 45,
      info: {
        Title: `Invoice ${data.invoice.invoiceNumber}`,
        Author: 'TechSprout LMS',
        Subject: `Invoice for ${data.invoice.courseTitle}`,
        Keywords: 'invoice, receipt, techsprout, lms',
        CreationDate: data.invoice.issuedAt,
      },
    });
  }

  private renderContent(doc: PDFKit.PDFDocument, data: InvoicePdfData): void {
    const { invoice, orderNumber } = data;
    const isPaid = invoice.status === 'PAID';
    const isRefunded = invoice.status === 'REFUNDED';

    // 1. TechSprout Logo Badge
    doc.roundedRect(45, 45, 28, 28, 6).fill('#0F766E');
    doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold').text('TS', 50, 52);

    // 2. Organization Header
    doc.fillColor('#0F172A').fontSize(16).font('Helvetica-Bold').text('TechSprout LMS', 80, 44);
    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .font('Helvetica')
      .text('Online Learning & Professional Academy', 80, 63);
    doc
      .fillColor('#94A3B8')
      .fontSize(8)
      .font('Helvetica')
      .text('Dhaka, Bangladesh • support@techsprout.edu', 80, 75);

    // 3. Status Badge & Metadata (Top Right)
    const badgeBg = isPaid ? '#ECFDF5' : isRefunded ? '#FEF2F2' : '#F1F5F9';
    const badgeStroke = isPaid ? '#A7F3D0' : isRefunded ? '#FECACA' : '#CBD5E1';
    const badgeText = isPaid ? '#047857' : isRefunded ? '#B91C1C' : '#475569';

    doc.roundedRect(395, 45, 155, 20, 4).fillAndStroke(badgeBg, badgeStroke);
    doc
      .fillColor(badgeText)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(`OFFICIAL RECEIPT • ${invoice.status}`, 395, 51, {
        width: 155,
        align: 'center',
      });

    doc
      .fillColor('#0F172A')
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(invoice.invoiceNumber, 300, 72, { width: 250, align: 'right' });

    const issuedDateStr = new Date(invoice.issuedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .font('Helvetica')
      .text(`Issued: ${issuedDateStr}`, 300, 86, { width: 250, align: 'right' });

    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .font('Helvetica')
      .text(`Order: ${orderNumber}`, 300, 98, { width: 250, align: 'right' });

    // 4. Divider Line
    doc.moveTo(45, 118).lineTo(550, 118).strokeColor('#E2E8F0').lineWidth(1).stroke();

    // 5. Billed To & Payment Details
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Bold').text('BILLED TO:', 45, 130);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(invoice.studentName, 45, 142);
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica').text(invoice.studentEmail, 45, 156);
    if (invoice.studentPhone) {
      doc.fillColor('#475569').fontSize(8.5).font('Helvetica').text(invoice.studentPhone, 45, 168);
    }

    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Bold').text('PAYMENT DETAILS:', 320, 130);
    doc
      .fillColor('#475569')
      .fontSize(8.5)
      .font('Helvetica')
      .text(`Method: ${invoice.paymentMethod}`, 320, 142);
    doc
      .fillColor('#475569')
      .fontSize(8.5)
      .font('Helvetica')
      .text(`Bank Txn: ${invoice.bankTranId}`, 320, 154);
    doc
      .fillColor('#475569')
      .fontSize(8.5)
      .font('Helvetica')
      .text(`Currency: ${invoice.currency}`, 320, 166);
    doc
      .fillColor(isRefunded ? '#B91C1C' : '#047857')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text(`Status: ${invoice.status}`, 320, 178);

    // 6. Refund Notice (if status is REFUNDED)
    let tableY = 196;
    if (isRefunded) {
      doc.roundedRect(45, 196, 505, 22, 4).fillAndStroke('#FEF2F2', '#FECACA');
      doc
        .fillColor('#B91C1C')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(
          'NOTICE: This invoice was refunded. The historical financial snapshot is preserved below.',
          55,
          203
        );
      tableY = 228;
    }

    // 7. Line Items Table Header
    doc.rect(45, tableY, 505, 22).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
    doc.text('Item Description', 55, tableY + 7);
    doc.text('Subtotal', 315, tableY + 7, { width: 65, align: 'right' });
    doc.text('Discount', 390, tableY + 7, { width: 65, align: 'right' });
    doc.text('Amount Paid', 465, tableY + 7, { width: 75, align: 'right' });

    // 8. Line Items Table Row
    const rowY = tableY + 22;
    doc.rect(45, rowY, 505, 40).strokeColor('#E2E8F0').stroke();
    doc
      .fillColor('#0F172A')
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(invoice.courseTitle, 55, rowY + 8, { width: 250 });
    doc
      .fillColor('#94A3B8')
      .fontSize(8)
      .font('Helvetica')
      .text('Lifetime Curriculum & Certificate Access', 55, rowY + 22);

    doc
      .fillColor('#334155')
      .fontSize(9)
      .font('Helvetica')
      .text(formatMinorUnits(invoice.subtotalCents, invoice.currency), 315, rowY + 12, {
        width: 65,
        align: 'right',
      });

    const discountStr =
      invoice.discountCents > 0
        ? `- ${formatMinorUnits(invoice.discountCents, invoice.currency)}`
        : formatMinorUnits(0, invoice.currency);

    doc
      .fillColor('#059669')
      .fontSize(9)
      .font('Helvetica')
      .text(discountStr, 390, rowY + 12, { width: 65, align: 'right' });

    doc
      .fillColor('#0F172A')
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(formatMinorUnits(invoice.payableCents, invoice.currency), 465, rowY + 12, {
        width: 75,
        align: 'right',
      });

    // 9. Totals Summary Block
    const summaryY = rowY + 50;
    doc.fillColor('#64748B').fontSize(8.5).font('Helvetica').text('Subtotal:', 340, summaryY);
    doc
      .fillColor('#334155')
      .fontSize(8.5)
      .font('Helvetica')
      .text(formatMinorUnits(invoice.subtotalCents, invoice.currency), 440, summaryY, {
        width: 100,
        align: 'right',
      });

    doc
      .fillColor('#059669')
      .fontSize(8.5)
      .font('Helvetica')
      .text('Total Discount:', 340, summaryY + 14);
    doc
      .fillColor('#059669')
      .fontSize(8.5)
      .font('Helvetica')
      .text(discountStr, 440, summaryY + 14, { width: 100, align: 'right' });

    doc
      .moveTo(340, summaryY + 30)
      .lineTo(545, summaryY + 30)
      .strokeColor('#CBD5E1')
      .lineWidth(0.75)
      .stroke();

    doc
      .fillColor('#0F172A')
      .fontSize(10.5)
      .font('Helvetica-Bold')
      .text('Total Paid:', 340, summaryY + 36);
    doc
      .fillColor('#0F766E')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(formatMinorUnits(invoice.payableCents, invoice.currency), 440, summaryY + 36, {
        width: 100,
        align: 'right',
      });

    // 10. Tax & Regulatory Notice
    doc
      .fillColor('#64748B')
      .fontSize(8)
      .font('Helvetica')
      .text('Prices are inclusive as displayed.', 45, summaryY + 70);
    doc
      .fillColor('#94A3B8')
      .fontSize(7.5)
      .font('Helvetica')
      .text(
        'No additional VAT or taxes are charged separately under regional regulations.',
        45,
        summaryY + 82
      );

    // 11. Footer
    doc.moveTo(45, 770).lineTo(550, 770).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
    doc
      .fillColor('#94A3B8')
      .fontSize(7.5)
      .font('Helvetica')
      .text('This is a computer-generated tax invoice and requires no physical signature.', 45, 778, {
        width: 505,
        align: 'center',
      });
    doc
      .fillColor('#94A3B8')
      .fontSize(7.5)
      .font('Helvetica')
      .text(`© ${new Date().getFullYear()} TechSprout School LMS. All rights reserved.`, 45, 788, {
        width: 505,
        align: 'center',
      });
  }
}
