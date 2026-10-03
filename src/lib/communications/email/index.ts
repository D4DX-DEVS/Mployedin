/**
 * Email communication service using Nodemailer.
 *
 * Provider chain (resolveTransport.ts):
 *  1. Employer SMTP override (premium feature — per-employer G Suite)
 *  2. System-wide provider chosen by the admin (SystemSettings.email.provider: SMTP or Amazon SES)
 *  3. Environment variables (EMAIL_PROVIDER=ses + SES_*, else GMAIL_*, SMTP_*, ETHEREAL_*)
 */
export { sendEmail, isUndeliverableAddress } from "./send";
export { EmailTemplates } from "./templates";
export type { EmailPayload, SmtpConfig, EmailProvider, ResolvedTransport } from "./types";
