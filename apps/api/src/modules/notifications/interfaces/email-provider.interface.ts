export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';
