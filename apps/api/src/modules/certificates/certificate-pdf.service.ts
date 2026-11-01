import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface GenerateCertificatePdfOptions {
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date | string;
  issuedAt: Date | string;
  finalScorePercentage?: number | null;
  status?: string;
  language?: 'en' | 'bn';
  verificationBaseUrl?: string;
}

function resolveFontPath(fontFilename: string): string {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts', fontFilename),
    path.resolve(__dirname, '../../../src/assets/fonts', fontFilename),
    path.resolve(process.cwd(), 'apps/api/src/assets/fonts', fontFilename),
    path.resolve(process.cwd(), 'src/assets/fonts', fontFilename),
    path.resolve(process.cwd(), 'assets/fonts', fontFilename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(__dirname, '../../assets/fonts', fontFilename);
}

@Injectable()
export class CertificatePdfService {
  private readonly logger = new Logger(CertificatePdfService.name);

  /**
   * Generates a deterministic, high-resolution A4 landscape certificate PDF in memory.
   * Supports both English ('en') and Bangla ('bn') layouts.
   */
  async generateCertificatePdf(options: GenerateCertificatePdfOptions): Promise<Buffer> {
    const {
      certificateNumber,
      studentName,
      courseTitle,
      instructorName,
      completedAt,
      issuedAt,
      finalScorePercentage,
      language = 'en',
      verificationBaseUrl = 'https://techsprout.edu',
    } = options;

    const isBn = language === 'bn';

    const regularFont = resolveFontPath('NotoSansBengali-Regular.ttf');
    const boldFont = resolveFontPath('NotoSansBengali-Bold.ttf');

    const cleanBaseUrl = (verificationBaseUrl || 'https://techsprout.edu').replace(/\/+$/, '');
    const verificationUrl = `${cleanBaseUrl}/verify/${encodeURIComponent(certificateNumber)}`;

    // Generate high-resolution QR code
    const qrBuffer = await QRCode.toBuffer(verificationUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 250,
      color: {
        dark: '#0B192C',
        light: '#FFFFFF',
      },
    });

    const formatDate = (val: Date | string): string => {
      try {
        const d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) return String(val);
        return d.toISOString().split('T')[0];
      } catch {
        return String(val);
      }
    };

    const formattedCompleted = formatDate(completedAt);
    const formattedIssued = formatDate(issuedAt);

    return new Promise((resolve, reject) => {
      try {
        // A4 Landscape dimensions: 841.89 x 595.28 points
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 0,
          info: {
            Title: `TechSprout Certificate - ${certificateNumber}`,
            Author: 'TechSprout Academy',
            Subject: `Course Completion Certificate for ${studentName}`,
            Keywords: 'certificate, techsprout, verification',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => {
          this.logger.error(`PDF generation stream error: ${err.message}`, err.stack);
          reject(err);
        });

        // Register custom bundled fonts for complete Unicode & Bengali conjunct support
        if (fs.existsSync(regularFont)) {
          doc.registerFont('CustomRegular', regularFont);
        } else {
          doc.registerFont('CustomRegular', 'Helvetica');
        }

        if (fs.existsSync(boldFont)) {
          doc.registerFont('CustomBold', boldFont);
        } else {
          doc.registerFont('CustomBold', 'Helvetica-Bold');
        }

        const textFontReg = 'CustomRegular';
        const textFontBold = 'CustomBold';

        // Outer Academic Frame (Deep Navy)
        doc.lineWidth(3.5).strokeColor('#0B192C').rect(22, 22, 797.89, 551.28).stroke();
        // Middle Inset Frame
        doc.lineWidth(1).strokeColor('#CBD5E1').rect(26, 26, 789.89, 543.28).stroke();
        // Inner Accent Frame (TechSprout Forest Emerald)
        doc.lineWidth(1.5).strokeColor('#047857').rect(30, 30, 781.89, 535.28).stroke();

        // Corner flourishes
        const corners = [
          [36, 36],
          [805.89, 36],
          [36, 559.28],
          [805.89, 559.28],
        ];
        for (const [cx, cy] of corners) {
          doc.circle(cx, cy, 3).fillColor('#047857').fill();
        }

        // 1. Header Branding
        const headerText = isBn
          ? 'টেকস্প্রাউট একাডেমি অব সফটওয়্যার ইঞ্জিনিয়ারিং'
          : 'TECHSPROUT ACADEMY OF SOFTWARE ENGINEERING';
        doc
          .font(textFontBold)
          .fontSize(12.5)
          .fillColor('#047857')
          .text(headerText, 40, 52, { align: 'center', width: 761.89 });

        // Decorative Header Divider
        doc.lineWidth(0.75).strokeColor('#CBD5E1').moveTo(260, 74).lineTo(582, 74).stroke();

        // 2. Certificate Title
        const titleText = isBn
          ? 'কোর্স সমাপনী সার্টিফিকেট'
          : 'CERTIFICATE OF ACHIEVEMENT';
        doc
          .font(textFontBold)
          .fontSize(25)
          .fillColor('#0B192C')
          .text(titleText, 40, 88, { align: 'center', width: 761.89 });

        // 3. Presentation Clause
        const presentationText = isBn
          ? 'গৌরবের সাথে এই সার্টিফিকেট প্রদান করা হচ্ছে'
          : 'THIS IS PROUDLY PRESENTED TO';
        doc
          .font(textFontReg)
          .fontSize(10.5)
          .fillColor('#64748B')
          .text(presentationText, 40, 130, { align: 'center', width: 761.89 });

        // 4. Recipient Name (Dynamic font size based on length to prevent clipping)
        const nameLen = studentName.length;
        const nameFontSize = nameLen > 40 ? 19 : nameLen > 28 ? 22 : 26;
        doc
          .font(textFontBold)
          .fontSize(nameFontSize)
          .fillColor('#047857')
          .text(studentName, 40, 155, { align: 'center', width: 761.89 });

        // Decorative Underline under Student Name
        doc.lineWidth(1.25).strokeColor('#E2E8F0').moveTo(210, 195).lineTo(632, 195).stroke();

        // 5. Completion Statement
        const statementText = isBn
          ? 'যিনি নিষ্ঠার সাথে সমস্ত পাঠ, বাস্তবমুখী প্রজেক্ট এবং প্রয়োজনীয় মূল্যায়ন সফলভাবে সম্পন্ন করেছেন'
          : 'for successfully completing all curriculum requirements, practical projects, and academic assessments for';
        doc
          .font(textFontReg)
          .fontSize(11)
          .fillColor('#334155')
          .text(statementText, 80, 210, { align: 'center', width: 681.89 });

        // 6. Course Title (Dynamic size based on length)
        const courseLen = courseTitle.length;
        const courseFontSize = courseLen > 55 ? 16 : courseLen > 38 ? 18 : 21;
        doc
          .font(textFontBold)
          .fontSize(courseFontSize)
          .fillColor('#0B192C')
          .text(courseTitle, 50, 245, { align: 'center', width: 741.89 });

        // 7. Final Score (Rendered if available)
        if (finalScorePercentage != null) {
          const scoreText = isBn
            ? `চূড়ান্ত মূল্যায়ন স্কোর: ${finalScorePercentage}%`
            : `Final Assessment Score: ${finalScorePercentage}%`;
          doc
            .font(textFontBold)
            .fontSize(10.5)
            .fillColor('#047857')
            .text(scoreText, 40, 295, { align: 'center', width: 761.89 });
        }

        // 8. Lower Section (3 Columns: Metadata, Signatures, QR Code)

        // Column 1: Metadata (Left)
        const metaX = 55;
        let metaY = 375;
        const certNumLabel = isBn ? 'সার্টিফিকেট নম্বর:' : 'Certificate ID:';
        doc.font(textFontBold).fontSize(8.5).fillColor('#64748B').text(certNumLabel, metaX, metaY);
        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor('#0B192C')
          .text(certificateNumber, metaX, metaY + 13);

        metaY += 34;
        const issuedLabel = isBn ? 'ইস্যুর তারিখ:' : 'Issue Date:';
        doc.font(textFontBold).fontSize(8.5).fillColor('#64748B').text(issuedLabel, metaX, metaY);
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#0B192C')
          .text(formattedIssued, metaX, metaY + 13);

        metaY += 34;
        const completedLabel = isBn ? 'সম্পন্নের তারিখ:' : 'Completion Date:';
        doc.font(textFontBold).fontSize(8.5).fillColor('#64748B').text(completedLabel, metaX, metaY);
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#0B192C')
          .text(formattedCompleted, metaX, metaY + 13);

        // Column 2: Signatures (Center)
        const sig1X = 285;
        const sigY = 440;
        doc.lineWidth(1).strokeColor('#94A3B8').moveTo(sig1X, sigY).lineTo(sig1X + 150, sigY).stroke();
        doc
          .font(textFontBold)
          .fontSize(10)
          .fillColor('#0B192C')
          .text(instructorName, sig1X, sigY + 6, { width: 150, align: 'center' });
        const instructorLabel = isBn ? 'কোর্স প্রশিক্ষক' : 'Course Instructor';
        doc
          .font(textFontReg)
          .fontSize(8.5)
          .fillColor('#64748B')
          .text(instructorLabel, sig1X, sigY + 20, { width: 150, align: 'center' });

        const sig2X = 475;
        doc.lineWidth(1).strokeColor('#94A3B8').moveTo(sig2X, sigY).lineTo(sig2X + 150, sigY).stroke();
        const authorityName = isBn ? 'একাডেমিক পরিচালক' : 'Academic Directorate';
        doc
          .font(textFontBold)
          .fontSize(10)
          .fillColor('#0B192C')
          .text(authorityName, sig2X, sigY + 6, { width: 150, align: 'center' });
        const authorityLabel = isBn ? 'টেকস্প্রাউট একাডেমি' : 'TechSprout Academy';
        doc
          .font(textFontReg)
          .fontSize(8.5)
          .fillColor('#64748B')
          .text(authorityLabel, sig2X, sigY + 20, { width: 150, align: 'center' });

        // Column 3: QR Code (Right)
        const qrX = 680;
        const qrY = 375;
        const qrSize = 82;
        doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
        const qrScanLabel = isBn ? 'যাচাই করতে স্ক্যান করুন' : 'Scan to Verify';
        doc
          .font(textFontReg)
          .fontSize(7.5)
          .fillColor('#64748B')
          .text(qrScanLabel, qrX - 10, qrY + qrSize + 4, { width: qrSize + 20, align: 'center' });

        // 9. Canonical Verification URL Footer
        const footerVerificationText = isBn
          ? `অফিসিয়াল যাচাইকরণ: ${verificationUrl}`
          : `Official Verification: ${verificationUrl}`;
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#94A3B8')
          .text(footerVerificationText, 40, 542, { align: 'center', width: 761.89 });

        // Finalize document
        doc.end();
      } catch (err: any) {
        this.logger.error(`Error initiating PDF generation: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }
}
