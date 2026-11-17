import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EmailSendResult {
  configured: boolean;
  delivered: boolean;
  reason?: string;
}

const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 8000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 8000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 12000;
const DEFAULT_SMTP_SEND_TIMEOUT_MS = 15000;

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey = '';
let testTransporterOverride: Transporter | null = null;

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  const num = Number(raw);
  if (Number.isFinite(num) && num >= 50 && num <= 60000) {
    return Math.floor(num);
  }
  return fallback;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export function setSmtpTransporterForTesting(transporter: Transporter | null): void {
  testTransporterOverride = transporter;
}

export function resetSmtpTransporterForTesting(): void {
  testTransporterOverride = null;
  if (cachedTransporter) {
    try {
      cachedTransporter.close();
    } catch {
      // ignore close errors during reset
    }
    cachedTransporter = null;
    cachedTransporterKey = '';
  }
}

function clearCachedTransporter(): void {
  if (cachedTransporter) {
    try {
      cachedTransporter.close();
    } catch {
      // ignore close errors during cache invalidation
    }
    cachedTransporter = null;
    cachedTransporterKey = '';
  }
}

function getSmtpTransporter(): { transporter: Transporter; sendTimeoutMs: number } {
  const sendTimeoutMs = parseTimeoutMs(
    process.env.SMTP_SEND_TIMEOUT_MS,
    DEFAULT_SMTP_SEND_TIMEOUT_MS
  );

  if (testTransporterOverride) {
    return { transporter: testTransporterOverride, sendTimeoutMs };
  }

  const host = process.env.SMTP_HOST!.trim();
  const rawPort = Number(process.env.SMTP_PORT || 587);
  const port = Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const passHash = crypto.createHash('sha256').update(pass).digest('hex').slice(0, 16);

  const connectionTimeout = parseTimeoutMs(
    process.env.SMTP_CONNECTION_TIMEOUT_MS,
    DEFAULT_SMTP_CONNECTION_TIMEOUT_MS
  );
  const greetingTimeout = parseTimeoutMs(
    process.env.SMTP_GREETING_TIMEOUT_MS,
    DEFAULT_SMTP_GREETING_TIMEOUT_MS
  );
  const socketTimeout = parseTimeoutMs(
    process.env.SMTP_SOCKET_TIMEOUT_MS,
    DEFAULT_SMTP_SOCKET_TIMEOUT_MS
  );

  const key = `${host}|${port}|${secure}|${user}|${passHash}|${connectionTimeout}|${greetingTimeout}|${socketTimeout}`;
  if (!cachedTransporter || cachedTransporterKey !== key) {
    clearCachedTransporter();
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      connectionTimeout,
      greetingTimeout,
      socketTimeout,
      tls: {
        minVersion: 'TLSv1.2'
      },
      auth: {
        user,
        pass
      }
    });
    cachedTransporterKey = key;
  }

  return { transporter: cachedTransporter, sendTimeoutMs };
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

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const { transporter, sendTimeoutMs } = getSmtpTransporter();
    const mailPromise = transporter.sendMail({
      from: process.env.SMTP_FROM || `"DIU Campus Ride Sharing" <${process.env.SMTP_USER!.trim()}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html
    });
    // Ensure a late sendMail rejection after timeout settlement cannot cause an UnhandledPromiseRejection.
    mailPromise.catch(() => {});

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutErr: any = new Error(`SMTP email delivery timed out after ${sendTimeoutMs}ms.`);
        timeoutErr.code = 'ESMTPTIMEOUT';
        reject(timeoutErr);
      }, sendTimeoutMs);
    });

    await Promise.race([mailPromise, timeoutPromise]);

    return {
      configured: true,
      delivered: true
    };
  } catch (error: any) {
    const code = String(error?.code || '').toUpperCase();
    const isTimeout =
      code === 'ETIMEDOUT' ||
      code === 'ESMTPTIMEOUT' ||
      String(error?.message || '').toLowerCase().includes('timeout');
    const isFatalTransportError =
      isTimeout ||
      code !== 'EENVELOPE';

    if (isFatalTransportError) {
      clearCachedTransporter();
    }
    console.error('SMTP email send failed:', error?.message || 'Unknown error');
    return {
      configured: true,
      delivered: false,
      reason: isTimeout
        ? 'Email delivery timed out while connecting to SMTP server.'
        : 'Failed to deliver email through SMTP provider.'
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
