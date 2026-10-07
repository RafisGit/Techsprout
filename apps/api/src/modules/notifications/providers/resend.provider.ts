import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../../config/env.config';
import {
  EmailProvider,
  SendEmailOptions,
  EmailSendResult,
} from '../interfaces/email-provider.interface';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const apiKey = env.RESEND_API_KEY;
    const fromEmail = env.RESEND_FROM_EMAIL || 'notifications@techsprout.io';

    if (!apiKey || apiKey.startsWith('re_placeholder') || env.NODE_ENV === 'test') {
      const mockId = `mock_resend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.logger.log(
        `[RESEND_MOCK] Email dispatched: to="${options.to}" subject="${options.subject}" from="${fromEmail}" mockId="${mockId}"`
      );
      return {
        success: true,
        messageId: mockId,
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.message || `HTTP ${response.status}: ${response.statusText}`;
        this.logger.error(`Resend API failed: ${errorMsg}`);
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        messageId: data.id,
      };
    } catch (err: any) {
      this.logger.error(`Resend network/dispatch error: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}
