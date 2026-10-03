import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { isWhatsAppEnabled, readWhatsAppEnv } from "@/lib/communications/whatsapp/config";
import { WhatsAppApiError } from "@/lib/communications/whatsapp/errors";
import { redactSecrets } from "@/lib/communications/whatsapp/redact";
import { syncTemplatesFromMeta } from "@/lib/communications/whatsapp/templateSync";

interface AuthCtx { userId: string; role: string; locale: string }

/** POST /api/admin/whatsapp/templates/sync — pull the WABA's templates. */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isWhatsAppEnabled()) {
    return NextResponse.json({ error: "WhatsApp is not configured on this server (WHATSAPP_* env vars)" }, { status: 409 });
  }
  // Templates belong to the business account, not the phone number: sync needs its id on top of the send config.
  if (!readWhatsAppEnv().businessAccountId) {
    return NextResponse.json({ error: "Template sync needs WHATSAPP_BUSINESS_ACCOUNT_ID, which is not set on this server" }, { status: 409 });
  }
  await connectDB();
  try {
    const result = await syncTemplatesFromMeta();
    await logActivity({ ...actorFromCtx(ctx), action: "admin.whatsapp.template.sync", resource: "notifications", changes: { after: result }, req });
    return NextResponse.json({ result });
  } catch (err) {
    logger.error({ err }, "[whatsapp] template sync failed");
    // Only a Graph API answer is "Meta rejected"; a database or network failure is not, and its message stays in the log.
    if (err instanceof WhatsAppApiError) {
      return NextResponse.json({ error: `Meta rejected the template sync: ${redactSecrets(err.message)}` }, { status: 502 });
    }
    return NextResponse.json({ error: "We couldn't sync the templates. Please try again." }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, { resource: "notifications", action: "update" });
