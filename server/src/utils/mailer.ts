import nodemailer from 'nodemailer';

export interface EmailSendResult {
  configured: boolean;
  delivered: boolean;
  reason?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailSendResult> {
  if (!isSmtpConfigured()) {
    return {
      configured: false,
      delivered: false,
      reason: 'SMTP email transport is not configured on this server.'
    };
  }

  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim()
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"DIU Campus Ride Sharing" <${process.env.SMTP_USER!.trim()}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html
    });

    return {
      configured: true,
      delivered: true
    };
  } catch (error: any) {
    console.error('SMTP email send failed:', error?.message || 'Unknown error');
    return {
      configured: true,
      delivered: false,
      reason: 'Failed to deliver email through SMTP provider.'
    };
  }
}
