/**
 * Email communication service using Nodemailer with Gmail OAuth2
 * or SMTP (for development). Configure via environment variables.
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
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    // Gmail OAuth2
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });
  } else if (process.env.SMTP_HOST) {
    // Generic SMTP
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development: ethereal fake SMTP (auto-created)
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: process.env.ETHEREAL_USER ?? "test@ethereal.email",
        pass: process.env.ETHEREAL_PASS ?? "testpass",
      },
    });
  }

  return transporter;
}

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
  const t = getTransporter();
  const toAddr = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;

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
      from: `MPLOYEDIN <${process.env.GMAIL_USER ?? process.env.SMTP_USER ?? "noreply@mployedin.com"}>`,
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${userName}</strong>,</p>
          <p>Thank you for registering on MPLOYEDIN. Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Verify Email</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this link:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
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
