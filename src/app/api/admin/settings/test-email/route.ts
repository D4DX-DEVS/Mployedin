import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { assertPublicHost } from "@/lib/security/ssrf";
import { smtpTestSchema } from "@/lib/validators/settings";

interface AuthCtx { userId: string; role: string; locale: string; }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { smtp } = await validateBody(req, smtpTestSchema);

  // Don't send test if password is masked placeholder
  if (smtp.smtpAppPassword === "••••••••") {
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

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: smtp.smtpPort || 587,
      secure: smtp.smtpSecure || false,
      auth: {
        user: smtp.smtpEmail,
        pass: smtp.smtpAppPassword,
      },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `MPLOYEDIN <${smtp.smtpEmail}>`,
      to: smtp.smtpEmail,
      subject: "MPLOYEDIN — SMTP Test Email",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p>This is a test email from your MPLOYEDIN platform.</p>
            <p>If you're reading this, your SMTP configuration is working correctly!</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
              Host: ${host}:${smtp.smtpPort || 587}<br>
              Secure: ${smtp.smtpSecure ? "Yes (SSL/TLS)" : "No (STARTTLS)"}
            </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ message: "Test email sent successfully to " + smtp.smtpEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    return NextResponse.json({ message: `SMTP Error: ${message}` }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, { resource: "users", action: "update" });
