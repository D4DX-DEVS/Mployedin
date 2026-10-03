import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { clearCommissionOverrideCache } from "@/lib/commissions/resolveRate";
import { clearSubscriptionEnforcementCache } from "@/lib/subscription/enforcementFlag";
import SystemSettings from "@/models/SystemSettings";
import type { ISystemSettings } from "@/models/SystemSettings";
import { validateBody } from "@/lib/validators";
import { systemSettingsUpdateSchema, SECRET_MASK } from "@/lib/validators/settings";
import { isSesConfigComplete } from "@/lib/communications/email/transports/ses";
import { assertPublicHost } from "@/lib/security/ssrf";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * Shape a lean settings document for the client, in place: both secrets become the
 * mask. An email provider the admin never chose stays unset, so the page can say so:
 * sendEmail() treats it as SMTP, and env SES applies only while nothing is saved.
 */
function toClientSettings(settings: Pick<ISystemSettings, "smtp" | "email"> | null): void {
  if (!settings) return;
  if (settings.smtp?.smtpAppPassword) settings.smtp.smtpAppPassword = SECRET_MASK;
  if (settings.email?.ses?.secretAccessKey) settings.email.ses.secretAccessKey = SECRET_MASK;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  // Settings include SMTP config — restrict to admin even if a custom
  // permission grant gives another role "users.read".
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  // The secrets are select:false; include them so we know whether they are set (they are masked below)
  let settings = await SystemSettings.findOne().select("+smtp.smtpAppPassword +email.ses.secretAccessKey").lean();
  if (!settings) {
    settings = await SystemSettings.findOneAndUpdate(
      {},
      { $setOnInsert: { platformName: "MPLOYEDIN", supportEmail: "support@mployedin.com", maintenanceMode: false } },
      { upsert: true, returnDocument: "after" }
    ).lean();
  }
  // Mask the secrets for the response — send a placeholder if set
  toClientSettings(settings);
  return NextResponse.json({ settings });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, systemSettingsUpdateSchema);
  const allowed: (keyof ISystemSettings)[] = ["platformName", "supportEmail", "maintenanceMode", "defaultCurrency", "subscriptionEnforcementEnabled", "commissionOverrides", "invoiceIssuer"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if ((body as Record<string, unknown>)[key] !== undefined) update[key] = (body as Record<string, unknown>)[key];
  }

  // Handle SMTP config separately
  if (body.smtp && typeof body.smtp === "object") {
    const smtp = body.smtp;
    // Unless a new password is typed (absent, blank or the mask), the stored one stays. It was saved for the stored
    // host and login: with another host or user it would be handed to that server, so refuse, as the SES key-ID
    // guard below does. The page sends its whole SMTP block on every save, so the usual save sends the stored values.
    const hostSent = smtp.smtpHost !== undefined;
    const userSent = smtp.smtpEmail !== undefined && smtp.smtpEmail !== "";
    if (hostSent || userSent) {
      const current = await SystemSettings.findOne()
        .select("smtp.smtpHost smtp.smtpEmail +smtp.smtpAppPassword")
        .lean<{ smtp?: { smtpHost?: string; smtpEmail?: string; smtpAppPassword?: string } } | null>();
      // A blank host is the transport's Gmail fallback (createSmtpTransporter): compare what would be dialled.
      const dialled = (host: string | undefined) => host || "smtp.gmail.com";
      const hostChanged = hostSent && dialled(smtp.smtpHost) !== dialled(current?.smtp?.smtpHost);
      const userChanged = userSent && smtp.smtpEmail !== (current?.smtp?.smtpEmail ?? "");
      const typedPassword = Boolean(smtp.smtpAppPassword) && smtp.smtpAppPassword !== SECRET_MASK;
      if (current?.smtp?.smtpAppPassword && !typedPassword && (hostChanged || userChanged)) {
        // A machine code: the settings page shows its own localized hint on the password field.
        return NextResponse.json({ error: "smtp_password_required" }, { status: 400 });
      }
      // The transport dials the saved host directly: refuse an internal address, as the test button does. Only a
      // changed host is looked up, so the usual save (and the maintenance switch on this page) never waits on DNS.
      if (hostChanged && smtp.smtpHost) {
        try {
          await assertPublicHost(smtp.smtpHost);
        } catch {
          return NextResponse.json({ error: "SMTP host is not reachable" }, { status: 400 });
        }
      }
    }
    if (smtp.smtpEmail !== undefined && smtp.smtpEmail !== "") update["smtp.smtpEmail"] = smtp.smtpEmail;
    if (smtp.smtpHost !== undefined) update["smtp.smtpHost"] = smtp.smtpHost;
    if (smtp.smtpPort !== undefined) update["smtp.smtpPort"] = smtp.smtpPort;
    if (smtp.smtpSecure !== undefined) update["smtp.smtpSecure"] = smtp.smtpSecure;
    // Only update password if user changed it (not the masked placeholder)
    if (smtp.smtpAppPassword && smtp.smtpAppPassword !== SECRET_MASK) {
      const { encryptIfPlain } = await import("@/lib/security/encryption");
      update["smtp.smtpAppPassword"] = encryptIfPlain(smtp.smtpAppPassword);
    }
  }

  // Email provider (SMTP | SES) and the SES credentials. Written only when the
  // request carries `email`, so saving another section never picks a provider.
  if (body.email && typeof body.email === "object") {
    const email = body.email;
    if (email.provider !== undefined) update["email.provider"] = email.provider;
    if (email.ses) {
      const ses = email.ses;
      // Unless a new secret is typed (absent, blank after the schema's trim, or the mask), the stored secret stays. It belongs
      // to the stored key ID: with another key ID it would pair the wrong two. The page blocks this too; this is the server floor.
      const typedSecret = Boolean(ses.secretAccessKey) && ses.secretAccessKey !== SECRET_MASK;
      if (ses.accessKeyId !== undefined && !typedSecret) {
        const current = await SystemSettings.findOne()
          .select("email.ses.accessKeyId +email.ses.secretAccessKey")
          .lean<{ email?: { ses?: { accessKeyId?: string; secretAccessKey?: string } } } | null>();
        if (current?.email?.ses?.secretAccessKey && ses.accessKeyId !== (current.email.ses.accessKeyId ?? "")) {
          return NextResponse.json({ error: "Enter the secret access key for the new access key ID" }, { status: 400 });
        }
      }
      if (ses.region !== undefined) update["email.ses.region"] = ses.region;
      if (ses.accessKeyId !== undefined) update["email.ses.accessKeyId"] = ses.accessKeyId;
      if (ses.fromEmail !== undefined) update["email.ses.fromEmail"] = ses.fromEmail;
      if (ses.fromName !== undefined) update["email.ses.fromName"] = ses.fromName;
      if (ses.configurationSet !== undefined) update["email.ses.configurationSet"] = ses.configurationSet;
      // Only update the secret when the admin typed a new one (not the mask)
      if (ses.secretAccessKey && ses.secretAccessKey !== SECRET_MASK) {
        const { encryptIfPlain } = await import("@/lib/security/encryption");
        update["email.ses.secretAccessKey"] = encryptIfPlain(ses.secretAccessKey);
      }
    }
  }

  const settings = await SystemSettings.findOneAndUpdate(
    {},
    { $set: update },
    { upsert: true, returnDocument: "after" }
  ).select("+email.ses.secretAccessKey").lean();

  // The admin picked SES but a required field is still blank: sendEmail() will
  // keep using SMTP (resolveTransport step 3) until this is fixed. Say so.
  let warning: "ses_incomplete" | undefined;
  if (settings?.email?.provider === "ses" && !isSesConfigComplete(settings.email.ses)) {
    warning = "ses_incomplete";
  }
  toClientSettings(settings);

  // Invalidate commission rate cache when overrides change
  if (update.commissionOverrides !== undefined) {
    clearCommissionOverrideCache();
  }

  // Invalidate subscription-enforcement cache so the toggle takes effect now
  if (update.subscriptionEnforcementEnabled !== undefined) {
    clearSubscriptionEnforcementCache();
  }

  // Secrets never go to the audit trail, encrypted or not.
  const audited: Record<string, unknown> = { ...update };
  for (const key of ["smtp.smtpAppPassword", "email.ses.secretAccessKey"]) {
    if (key in audited) audited[key] = "[redacted]";
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "settings.update",
    resource: "settings",
    changes: { after: audited },
    req,
  });

  return NextResponse.json({ settings, warning });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
