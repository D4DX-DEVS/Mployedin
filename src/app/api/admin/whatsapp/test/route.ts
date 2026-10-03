import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { whatsAppTestSendSchema } from "@/lib/validators/whatsapp";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";
import User from "@/models/User";
import { sendWhatsAppTemplate } from "@/lib/communications/whatsapp/send";
import { redactSecrets } from "@/lib/communications/whatsapp/redact";
import { hasOptedOut, type WhatsAppConsentState } from "@/lib/communications/whatsapp/optOut";
import { toWaRecipient } from "@/lib/communications/whatsapp/phone";
import { numberMatchFilter } from "@/lib/communications/whatsapp/webhookHandlers";
import { isNumberSuppressed } from "@/models/WhatsAppSuppression";

interface AuthCtx { userId: string; role: string; locale: string }

/** "+971501234567" → "+9715••••••67": enough to recognise, not enough to dial. */
function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 5)}${"•".repeat(phone.length - 7)}${phone.slice(-2)}`;
}

/** POST /api/admin/whatsapp/test — one template message to one number, Meta's answer verbatim. */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rl = await checkRateLimit(`whatsapp-test:${ctx.userId}`, { limit: 10, windowSec: 600, prefix: "wa-test" });
  if (!rl.allowed) return NextResponse.json({ error: "Too many test messages. Please wait a few minutes and try again." }, { status: 429 });

  const body = await validateBody(req, whatsAppTestSendSchema);
  await connectDB();

  // STOP is honoured for test sends too: the same accounts STOP reaches, any one of them out refuses, and so
  // does the number's own entry on the suppression list (it outlives a re-ticked channel on any account).
  // An invalid number matches nothing here and fails in send. The master switch does not apply: admins test before turning it on.
  const recipient = toWaRecipient(body.to);
  if (recipient) {
    const accounts = (await User.find(numberMatchFilter(recipient)).select("whatsapp.optInAt whatsapp.optOutAt").lean()) as Array<{ whatsapp?: WhatsAppConsentState }>;
    if (accounts.some((a) => hasOptedOut(a.whatsapp)) || (await isNumberSuppressed(`+${recipient}`))) {
      return NextResponse.json({ error: "opted_out" }, { status: 409 });
    }
  }

  const outcome = await sendWhatsAppTemplate({
    to: body.to,
    templateName: body.templateName,
    language: body.language,
    params: body.params,
    source: "test",
    category: "system",
    userId: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "admin.whatsapp.test_send",
    resource: "notifications",
    changes: { after: { to: maskPhone(body.to), templateName: body.templateName, status: outcome.status } },
    req,
  });

  // Listed between the check above and the send: the same answer.
  if (outcome.status === "skipped") return NextResponse.json({ error: "opted_out" }, { status: 409 });
  if (outcome.status === "failed") {
    // Meta's wording is the point of a test send, but a non-Graph error (a fetch TypeError) can carry the bearer token.
    return NextResponse.json({ error: `Meta rejected the message: ${redactSecrets(outcome.error.message)}`, errorKind: outcome.errorKind }, { status: 502 });
  }
  return NextResponse.json({ outcome: { status: outcome.status, messageId: outcome.messageId } });
}

export const POST = withAuth(postHandler, { resource: "notifications", action: "update" });
