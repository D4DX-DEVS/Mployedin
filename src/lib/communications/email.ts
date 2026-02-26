/**
 * Email communication service using Nodemailer with Gmail OAuth2
 * or SMTP (for development). Configure via environment variables.
 */

import nodemailer from "nodemailer";

interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
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
  const info = await t.sendMail({
    from: `MPLOYEDIN <${process.env.GMAIL_USER ?? process.env.SMTP_USER ?? "noreply@mployedin.com"}>`,
    to: Array.isArray(payload.to) ? payload.to.join(", ") : payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
    replyTo: payload.replyTo,
  });
  return { messageId: info.messageId };
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
};
