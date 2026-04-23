import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { encryptIfPlain, decrypt } from "@/lib/security/encryption";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { employerSmtpConfigSchema } from "@/lib/validators/settings";

interface AuthCtx { userId: string; role: string; locale: string; }

// GET /api/employers/me/smtp — get employer's SMTP override config
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("+smtpOverride.smtpAppPassword")
    .lean();

  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const smtp = employer.smtpOverride ?? null;

  // Mask the password
  if (smtp?.smtpAppPassword) {
    try { smtp.smtpAppPassword = decrypt(smtp.smtpAppPassword); } catch { /* already plain */ }
    smtp.smtpAppPassword = "••••••••";
  }

  return NextResponse.json({ smtp });
}

// PUT /api/employers/me/smtp — save employer's SMTP override config
async function putHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  // Premium check
  if (employer.subscriptionType !== "premium") {
    return NextResponse.json({ error: "Premium subscription required" }, { status: 403 });
  }

  const body = await validateBody(req, employerSmtpConfigSchema);
  const smtp = body.smtp;

  const update: Record<string, unknown> = {};
  if (smtp.smtpEmail !== undefined) update["smtpOverride.smtpEmail"] = smtp.smtpEmail;
  if (smtp.smtpHost !== undefined) update["smtpOverride.smtpHost"] = smtp.smtpHost;
  if (smtp.smtpPort !== undefined) update["smtpOverride.smtpPort"] = smtp.smtpPort;
  if (smtp.smtpSecure !== undefined) update["smtpOverride.smtpSecure"] = smtp.smtpSecure;

  // Only update password if changed (not masked placeholder)
  if (smtp.smtpAppPassword && smtp.smtpAppPassword !== "••••••••") {
    update["smtpOverride.smtpAppPassword"] = encryptIfPlain(smtp.smtpAppPassword);
  }

  await Employer.updateOne({ _id: employer._id }, { $set: update });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.smtp.update",
    resource: "employer",
    resourceId: employer._id.toString(),
    changes: { after: { smtpEmail: smtp.smtpEmail, smtpHost: smtp.smtpHost } },
    req,
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/employers/me/smtp — clear employer's SMTP override
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  await Employer.updateOne(
    { userId: ctx.userId },
    { $unset: { smtpOverride: 1 } }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.smtp.clear",
    resource: "employer",
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PUT = withAuth(putHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "update" });
