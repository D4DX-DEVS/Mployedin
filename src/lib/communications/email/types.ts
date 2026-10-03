export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** User ID for List-Unsubscribe header (RFC 8058). If provided, adds one-click unsubscribe. */
  userId?: string;
  /** Source identifier for email logging (e.g. "orchestrator", "daily-digest", "broadcast") */
  source?: string;
  /** Category for email logging (e.g. "jobs", "applications", "system") */
  category?: string;
  /** Employer ID — if provided, checks for employer SMTP override first */
  employerId?: string;
  /** Sender display name override (e.g. company name) */
  senderName?: string;
  /** File attachments */
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SmtpConfig {
  smtpEmail: string;
  smtpAppPassword: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

export type EmailProvider = "smtp" | "ses";

export interface ResolvedTransport {
  transporter: import("nodemailer").Transporter;
  fromEmail: string;
  /** Display name for the From header when the payload gives none. */
  fromName?: string;
  provider: EmailProvider;
  /** SES configuration set to stamp on the message (event publishing). */
  sesConfigurationSet?: string;
}
