import nodemailer from "nodemailer";
import type { SmtpConfig } from "../types";

/**
 * Shared connection policy for every SMTP transporter we build.
 *
 * Without `pool`, nodemailer opens a new TCP connection AND a new SMTP AUTH for
 * every single message. The daily digest fans out through Inngest at concurrency
 * 5, so one run produced hundreds of logins within minutes and Gmail answered
 * `454-4.7.0 Too many login attempts`, which then killed every transactional mail
 * (OTP, verification, password reset) queued behind it. Pooling keeps a single
 * authenticated connection alive and paces the queue instead of re-authenticating.
 */
export const POOL_OPTIONS = {
  pool: true,
  maxConnections: 1,
  maxMessages: 100,
  rateDelta: 60_000,
  rateLimit: 15,
  connectionTimeout: 20_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

/**
 * Gmail shows app passwords in four space-separated groups and they are routinely
 * pasted that way into .env or the DO dashboard, where SMTP AUTH then rejects the
 * spaces. Only Gmail gets this treatment: on another provider a space can be a
 * real character in the password, and stripping it would break a working login.
 */
export function normalizeSmtpPassword(raw: string | undefined, host: string | undefined): string | undefined {
  if (!raw) return raw;
  return /gmail|googlemail/i.test(host ?? "") ? raw.replace(/\s+/g, "") : raw;
}

let defaultTransporter: nodemailer.Transporter | null = null;

/** GMAIL_* OAuth2 → SMTP_* / EMAIL_* → Ethereal (dev). Built once per process. */
export function getEnvTransporter(): nodemailer.Transporter {
  if (defaultTransporter) return defaultTransporter;

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    // Gmail OAuth2
    defaultTransporter = nodemailer.createTransport({
      ...POOL_OPTIONS,
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });
  } else if (process.env.SMTP_HOST || process.env.EMAIL_HOST) {
    // Generic SMTP (supports both SMTP_* and EMAIL_* env var naming)
    defaultTransporter = nodemailer.createTransport({
      ...POOL_OPTIONS,
      host: process.env.SMTP_HOST ?? process.env.EMAIL_HOST,
      port: parseInt(process.env.SMTP_PORT ?? process.env.EMAIL_PORT ?? "587"),
      secure: (process.env.SMTP_SECURE ?? process.env.EMAIL_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER ?? process.env.EMAIL_USER,
        pass: normalizeSmtpPassword(
          process.env.SMTP_PASS ?? process.env.EMAIL_PASS,
          process.env.SMTP_HOST ?? process.env.EMAIL_HOST,
        ),
      },
    });
  } else {
    // Development: ethereal fake SMTP (auto-created)
    defaultTransporter = nodemailer.createTransport({
      ...POOL_OPTIONS,
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: process.env.ETHEREAL_USER ?? "test@ethereal.email",
        pass: process.env.ETHEREAL_PASS ?? "testpass",
      },
    });
  }

  return defaultTransporter;
}

/** The From address that matches getEnvTransporter(). */
export function envFromEmail(): string {
  return process.env.GMAIL_USER ?? process.env.SMTP_USER ?? process.env.EMAIL_USER ?? "noreply@mployedin.com";
}

/**
 * Pooled transporters own a live socket, so building one per send would leak a
 * connection for every message — the opposite of what pooling is for. Employer
 * overrides and the DB-level SMTP config are both stable, so key the cache on the
 * config itself: a changed host/user/password simply produces a new entry.
 */
const smtpTransporterCache = new Map<string, nodemailer.Transporter>();

export function createSmtpTransporter(smtp: SmtpConfig): nodemailer.Transporter {
  const host = smtp.smtpHost || "smtp.gmail.com";
  const port = smtp.smtpPort || 587;
  const pass = normalizeSmtpPassword(smtp.smtpAppPassword, host) ?? smtp.smtpAppPassword;
  const cacheKey = [host, port, String(smtp.smtpSecure || false), smtp.smtpEmail, pass].join("|");
  const cached = smtpTransporterCache.get(cacheKey);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    ...POOL_OPTIONS,
    host,
    port,
    secure: smtp.smtpSecure || false,
    auth: { user: smtp.smtpEmail, pass },
  });

  smtpTransporterCache.set(cacheKey, transporter);
  return transporter;
}
