import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { smtpTestSchema } from "@/lib/validators/settings";

interface AuthCtx { userId: string; role: string; locale: string; }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  if (employer.subscriptionType !== "premium") {
    return NextResponse.json({ error: "Premium subscription required" }, { status: 403 });
  }

  const { smtp } = await validateBody(req, smtpTestSchema);

  if (smtp.smtpAppPassword === "••••••••") {
    return NextResponse.json({ message: "Please enter the actual app password before testing" }, { status: 400 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.smtpHost || "smtp.gmail.com",
      port: smtp.smtpPort || 587,
      secure: smtp.smtpSecure || false,
      auth: {
        user: smtp.smtpEmail,
        pass: smtp.smtpAppPassword,
      },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `${employer.companyName} <${smtp.smtpEmail}>`,
      to: smtp.smtpEmail,
      subject: `${employer.companyName} — SMTP Test Email`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${employer.companyName}</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p>This is a test email from your custom SMTP configuration on MPLOYEDIN.</p>
            <p>If you're reading this, your email setup is working correctly!</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
              Host: ${smtp.smtpHost || "smtp.gmail.com"}:${smtp.smtpPort || 587}
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

export const POST = withAuth(postHandler, { resource: "employers", action: "update" });
