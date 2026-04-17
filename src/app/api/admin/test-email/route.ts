import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { sendEmail } from "@/lib/communications/email";

/**
 * POST /api/admin/test-email
 * Sends a test email to verify the email system is working.
 * Body: { to: string }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const to = body.to;

  if (!to || typeof to !== "string" || !to.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  try {
    const result = await sendEmail({
      to,
      subject: "MPLOYEDIN Test Email – Notification System",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111827; margin: 0 0 12px;">Test Email</h2>
            <p style="color: #374151;">This is a test email from the MPLOYEDIN notification system.</p>
            <p style="color: #374151;">If you received this, the email delivery pipeline is working correctly.</p>
            <div style="margin-top: 16px; padding: 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
              <p style="color: #15803d; margin: 0; font-size: 14px;">✅ Email system operational</p>
            </div>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
              Sent at ${new Date().toISOString()} by admin.
            </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${to} (ID: ${result.messageId})`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Email send failed", message },
      { status: 500 },
    );
  }
});
