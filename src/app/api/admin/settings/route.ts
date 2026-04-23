import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import SystemSettings from "@/models/SystemSettings";
import type { ISystemSettings } from "@/models/SystemSettings";
import { validateBody } from "@/lib/validators";
import { systemSettingsUpdateSchema } from "@/lib/validators/settings";

interface AuthCtx { userId: string; role: string; locale: string; }

async function getHandler() {
  await connectDB();
  // Use select("+smtp.smtpAppPassword") to include the password field for admin
  let settings = await SystemSettings.findOne().select("+smtp.smtpAppPassword").lean();
  if (!settings) {
    settings = await SystemSettings.findOneAndUpdate(
      {},
      { $setOnInsert: { platformName: "MPLOYEDIN", supportEmail: "support@mployedin.com", maintenanceMode: false } },
      { upsert: true, new: true }
    ).lean();
  }
  // Mask the password for the response — send a placeholder if set
  if (settings?.smtp?.smtpAppPassword) {
    settings.smtp.smtpAppPassword = "••••••••";
  }
  return NextResponse.json({ settings });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, systemSettingsUpdateSchema);
  const allowed: (keyof ISystemSettings)[] = ["platformName", "supportEmail", "maintenanceMode"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if ((body as Record<string, unknown>)[key] !== undefined) update[key] = (body as Record<string, unknown>)[key];
  }

  // Handle SMTP config separately
  if (body.smtp && typeof body.smtp === "object") {
    const smtp = body.smtp;
    if (smtp.smtpEmail !== undefined) update["smtp.smtpEmail"] = smtp.smtpEmail;
    if (smtp.smtpHost !== undefined) update["smtp.smtpHost"] = smtp.smtpHost;
    if (smtp.smtpPort !== undefined) update["smtp.smtpPort"] = smtp.smtpPort;
    if (smtp.smtpSecure !== undefined) update["smtp.smtpSecure"] = smtp.smtpSecure;
    // Only update password if user changed it (not the masked placeholder)
    if (smtp.smtpAppPassword && smtp.smtpAppPassword !== "••••••••") {
      const { encryptIfPlain } = await import("@/lib/security/encryption");
      update["smtp.smtpAppPassword"] = encryptIfPlain(smtp.smtpAppPassword);
    }
  }

  const settings = await SystemSettings.findOneAndUpdate(
    {},
    { $set: update },
    { upsert: true, new: true }
  ).lean();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "settings.update",
    resource: "settings",
    changes: { after: update },
    req,
  });

  return NextResponse.json({ settings });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
