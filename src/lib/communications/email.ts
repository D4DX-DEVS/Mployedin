/**
 * Email communication service using Nodemailer.
 *
 * Priority chain for SMTP config:
 *  1. Employer SMTP override (premium feature — per-employer G Suite)
 *  2. System-wide SMTP from admin settings (SystemSettings.smtp in DB)
 *  3. Environment variables (GMAIL_*, SMTP_*, ETHEREAL_*)
 */

import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { logEmailDelivery } from "@/models/EmailLog";

interface EmailPayload {
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
}

interface SmtpConfig {
  smtpEmail: string;
  smtpAppPassword: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

let defaultTransporter: nodemailer.Transporter | null = null;

function getEnvTransporter(): nodemailer.Transporter {
  if (defaultTransporter) return defaultTransporter;

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    // Gmail OAuth2
    defaultTransporter = nodemailer.createTransport({
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
      host: process.env.SMTP_HOST ?? process.env.EMAIL_HOST,
      port: parseInt(process.env.SMTP_PORT ?? process.env.EMAIL_PORT ?? "587"),
      secure: (process.env.SMTP_SECURE ?? process.env.EMAIL_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER ?? process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS ?? process.env.EMAIL_PASS,
      },
    });
  } else {
    // Development: ethereal fake SMTP (auto-created)
    defaultTransporter = nodemailer.createTransport({
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

function createSmtpTransporter(smtp: SmtpConfig): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: smtp.smtpHost || "smtp.gmail.com",
    port: smtp.smtpPort || 587,
    secure: smtp.smtpSecure || false,
    auth: {
      user: smtp.smtpEmail,
      pass: smtp.smtpAppPassword,
    },
  });
}

/**
 * Resolve the best transporter and sender email in order:
 *  1. Employer SMTP override (if employerId provided and employer has custom SMTP)
 *  2. System-wide SMTP from DB (SystemSettings.smtp)
 *  3. Environment variable based transporter
 */
async function resolveTransporter(employerId?: string): Promise<{ transporter: nodemailer.Transporter; fromEmail: string }> {
  // 1. Try employer-level SMTP override
  if (employerId) {
    try {
      const { connectDB } = await import("@/lib/db/mongoose");
      await connectDB();
      const { Employer } = await import("@/models/Employer");
      const employer = await Employer.findById(employerId)
        .select("+smtpOverride.smtpAppPassword")
        .lean();
      if (employer?.smtpOverride?.smtpEmail && employer.smtpOverride.smtpAppPassword) {
        const { decrypt } = await import("@/lib/security/encryption");
        let password = employer.smtpOverride.smtpAppPassword;
        try { password = decrypt(password); } catch { /* already plain */ }
        const smtp: SmtpConfig = {
          smtpEmail: employer.smtpOverride.smtpEmail,
          smtpAppPassword: password,
          smtpHost: employer.smtpOverride.smtpHost,
          smtpPort: employer.smtpOverride.smtpPort,
          smtpSecure: employer.smtpOverride.smtpSecure,
        };
        return { transporter: createSmtpTransporter(smtp), fromEmail: smtp.smtpEmail };
      }
    } catch { /* fall through to system-wide */ }
  }

  // 2. Try system-wide SMTP from DB
  try {
    const { connectDB } = await import("@/lib/db/mongoose");
    await connectDB();
    const { default: SystemSettings } = await import("@/models/SystemSettings");
    const settings = await SystemSettings.findOne().select("+smtp.smtpAppPassword").lean();
    if (settings?.smtp?.smtpEmail && settings.smtp.smtpAppPassword) {
      const { decrypt } = await import("@/lib/security/encryption");
      let password = settings.smtp.smtpAppPassword;
      try { password = decrypt(password); } catch { /* already plain */ }
      const smtp: SmtpConfig = {
        smtpEmail: settings.smtp.smtpEmail,
        smtpAppPassword: password,
        smtpHost: settings.smtp.smtpHost,
        smtpPort: settings.smtp.smtpPort,
        smtpSecure: settings.smtp.smtpSecure,
      };
      return { transporter: createSmtpTransporter(smtp), fromEmail: smtp.smtpEmail };
    }
  } catch { /* fall through to env vars */ }

  // 3. Fall back to env-based transporter
  const fromEmail = process.env.GMAIL_USER ?? process.env.SMTP_USER ?? process.env.EMAIL_USER ?? "noreply@mployedin.com";
  return { transporter: getEnvTransporter(), fromEmail };
}

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
  const { transporter: t, fromEmail } = await resolveTransporter(payload.employerId);
  const toAddr = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
  const senderName = payload.senderName || "MPLOYEDIN";

  // Build List-Unsubscribe headers (RFC 8058) if userId is provided
  const headers: Record<string, string> = {};
  if (payload.userId && process.env.NEXTAUTH_SECRET) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
    const token = jwt.sign({ userId: payload.userId, action: "unsubscribe" }, process.env.NEXTAUTH_SECRET, { expiresIn: "90d" });
    const unsubUrl = `${baseUrl}/api/unsubscribe?token=${token}`;
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const info = await t.sendMail({
      from: `${senderName} <${fromEmail}>`,
      to: toAddr,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
      replyTo: payload.replyTo,
      headers,
    });

    // Log successful delivery (non-blocking)
    logEmailDelivery({
      userId: payload.userId,
      to: toAddr,
      subject: payload.subject,
      category: payload.category ?? "system",
      source: payload.source ?? "direct",
      status: "sent",
      messageId: info.messageId,
    }).catch(() => {});

    return { messageId: info.messageId };
  } catch (err) {
    // Log failure (non-blocking)
    logEmailDelivery({
      userId: payload.userId,
      to: toAddr,
      subject: payload.subject,
      category: payload.category ?? "system",
      source: payload.source ?? "direct",
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    }).catch(() => {});

    throw err;
  }
}

// Pre-built email templates
export const EmailTemplates = {
  applicationReceived: (applicantName: string, jobTitle: string, companyName: string) => ({
    subject: `Application Received – ${jobTitle} at ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been received successfully.</p>
          <p>Our team will review your profile and get back to you within 3-5 business days.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  interviewScheduled: (applicantName: string, jobTitle: string, dateTime: string, location: string) => ({
    subject: `Interview Scheduled – ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Your interview for <strong>${jobTitle}</strong> has been scheduled:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${dateTime}</p>
            <p style="margin: 4px 0;"><strong>Location:</strong> ${location}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  statusUpdate: (applicantName: string, jobTitle: string, status: string) => ({
    subject: `Application Update – ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Your application status for <strong>${jobTitle}</strong> has been updated to: <strong>${status.toUpperCase()}</strong></p>
          <p>Log in to your MPLOYEDIN dashboard to view more details.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  verifyEmail: (userName: string, verifyUrl: string) => ({
    subject: "Verify Your Email – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your Career, Amplified</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${userName}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Thank you for joining MPLOYEDIN! Please verify your email address to unlock full access to your account and all platform features.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Verify My Email</a>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="margin: 8px 0 0; font-size: 13px; word-break: break-all;"><a href="${verifyUrl}" style="color: #0D6FD8;">${verifyUrl}</a></p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">This link expires in 24 hours. If you didn't create an account on MPLOYEDIN, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  employerWelcome: (contactName: string, email: string, password: string, agentName: string, loginUrl: string) => ({
    subject: "Welcome to MPLOYEDIN – Your Account is Ready",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${contactName}</strong>,</p>
          <p>Your employer account has been created by <strong>${agentName}</strong>. You can now start posting jobs and managing candidates on MPLOYEDIN.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${loginUrl}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Log In Now</a>
          </div>
          <p style="color: #ef4444; font-size: 14px; font-weight: 600;">Please change your password after your first login.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  jobSeekerWelcome: (name: string, dashboardUrl: string) => ({
    subject: "Welcome to MPLOYEDIN – Let's Find Your Next Opportunity!",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your Career, Amplified</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${name}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Welcome aboard! You've just joined a community of professionals finding their next career move through MPLOYEDIN.</p>
          
          <div style="background: #f0f7ff; border-left: 4px solid #0D6FD8; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-weight: 600; color: #111827; font-size: 15px;">Get started in 3 steps:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; vertical-align: top; width: 32px;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">1</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Complete your profile</strong> — Add skills, experience & preferences so employers find you</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">2</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Browse jobs</strong> — Explore opportunities matched to your skills</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">3</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Get matched</strong> — Our AI recommends the best jobs for you automatically</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Go to My Dashboard</a>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Pro tip:</strong> Profiles with a photo, 5+ skills, and work experience get 3x more views from employers.</p>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  employerSelfWelcome: (contactName: string, companyName: string, dashboardUrl: string) => ({
    subject: `Welcome to MPLOYEDIN – ${companyName} Is Ready to Hire!`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Hire Smarter, Faster</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${contactName}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;"><strong>${companyName}</strong> is now registered on MPLOYEDIN. You're ready to start connecting with top talent.</p>

          <div style="background: #f0f7ff; border-left: 4px solid #0D6FD8; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-weight: 600; color: #111827; font-size: 15px;">What you can do now:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; vertical-align: top; width: 32px;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">1</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Post your first job</strong> — Reach thousands of qualified candidates instantly</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">2</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Browse candidates</strong> — Search our database of job seekers matched to your needs</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">3</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Invite your team</strong> — Add colleagues to collaborate on hiring decisions</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Go to Dashboard</a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  passwordReset: (resetUrl: string) => ({
    subject: "Reset Your Password – MPLOYEDIN",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>You requested a password reset for your MPLOYEDIN account.</p>
          <p>Click the button below to set a new password. This link expires in <strong>15 minutes</strong>.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this link:<br><a href="${resetUrl}">${resetUrl}</a></p>
          <p style="color: #6b7280; font-size: 14px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),
};
