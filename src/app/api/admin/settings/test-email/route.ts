import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { assertPublicHost } from "@/lib/security/ssrf";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { escapeHtml } from "@/lib/security/html-escape";
import logger from "@/lib/logger";
import { emailProviderTestSchema, SECRET_MASK } from "@/lib/validators/settings";
import { createSesTransporter, type SesConfig } from "@/lib/communications/email/transports/ses";
import SystemSettings from "@/models/SystemSettings";

interface AuthCtx { userId: string; role: string; locale: string; }

function testBody(lines: string[]): string {
  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p>This is a test email from your MPLOYEDIN platform.</p>
            <p>If you're reading this, your email configuration is working correctly!</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">${lines.map(escapeHtml).join("<br>")}</p>
          </div>
        </div>
      `;
}

/** POST /api/admin/settings/test-email — { provider: "smtp", smtp, to? } | { provider: "ses", ses, to? } */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Each test dials a server and sends a real email: the same budget as the WhatsApp test send.
  const rl = await checkRateLimit(`email-test:${ctx.userId}`, { limit: 10, windowSec: 600, prefix: "email-test" });
  if (!rl.allowed) return NextResponse.json({ message: "Too many test emails. Please wait a few minutes and try again." }, { status: 429 });

  const body = await validateBody(req, emailProviderTestSchema);

  if (body.provider === "smtp") {
    const { smtp } = body;
    // Don't send test if password is masked placeholder
    if (smtp.smtpAppPassword === SECRET_MASK) {
      return NextResponse.json({ message: "Please enter the actual app password before testing" }, { status: 400 });
    }

    const host = smtp.smtpHost || "smtp.gmail.com";

    // SECURITY: the host is user-supplied and we dial it directly — refuse
    // internal addresses so this cannot be used to probe the private network.
    try {
      await assertPublicHost(host);
    } catch {
      return NextResponse.json({ message: "SMTP host is not reachable" }, { status: 400 });
    }

    const to = body.to ?? smtp.smtpEmail;
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: smtp.smtpPort || 587,
        secure: smtp.smtpSecure || false,
        auth: { user: smtp.smtpEmail, pass: smtp.smtpAppPassword },
      });
      await transporter.verify();
      await transporter.sendMail({
        from: `MPLOYEDIN <${smtp.smtpEmail}>`,
        to,
        subject: "MPLOYEDIN — SMTP Test Email",
        html: testBody([`Provider: SMTP`, `Host: ${host}:${smtp.smtpPort || 587}`, `Secure: ${smtp.smtpSecure ? "Yes (SSL/TLS)" : "No (STARTTLS)"}`]),
      });
      return NextResponse.json({ message: "Test email sent successfully to " + to });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown SMTP error";
      return NextResponse.json({ message: `SMTP Error: ${message}` }, { status: 500 });
    }
  }

  // provider === "ses"
  const ses: SesConfig = { ...body.ses };
  if (ses.secretAccessKey === SECRET_MASK) {
    await connectDB();
    const stored = await SystemSettings.findOne().select("+email.ses.secretAccessKey").lean();
    const encrypted = stored?.email?.ses?.secretAccessKey;
    if (!encrypted) {
      return NextResponse.json({ message: "Please enter the SES secret access key before testing" }, { status: 400 });
    }
    // The stored secret belongs to the stored key ID; never test it paired with another one.
    if (ses.accessKeyId !== stored?.email?.ses?.accessKeyId) {
      return NextResponse.json({ message: "Enter the secret access key for the new access key ID before testing" }, { status: 400 });
    }
    // The model's read hook has normally decrypted it already: plaintext passes through unchanged.
    // Real ciphertext that fails to decrypt (wrong key) warns, as resolveTransport does, and the stored value is tried.
    const { decryptIfEncrypted } = await import("@/lib/security/encryption");
    try {
      ses.secretAccessKey = decryptIfEncrypted(encrypted);
    } catch (err) {
      logger.warn({ err }, "SES secret decrypt failed, using stored value");
      ses.secretAccessKey = encrypted;
    }
  }

  const to = body.to ?? ses.fromEmail;
  try {
    const transporter = createSesTransporter(ses);
    await transporter.sendMail({
      from: `${ses.fromName || "MPLOYEDIN"} <${ses.fromEmail}>`,
      to,
      subject: "MPLOYEDIN — Amazon SES Test Email",
      html: testBody([`Provider: Amazon SES`, `Region: ${ses.region}`, `Configuration set: ${ses.configurationSet || "none"}`]),
      ...(ses.configurationSet ? { ses: { ConfigurationSetName: ses.configurationSet } } : {}),
    });
    return NextResponse.json({ message: "Test email sent successfully via Amazon SES to " + to });
  } catch (err) {
    // Typical sandbox answer: "MessageRejected: Email address is not verified" — shown as-is, it is the fix.
    const message = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown SES error";
    return NextResponse.json({ message: `SES Error: ${message}` }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, { resource: "users", action: "update" });
