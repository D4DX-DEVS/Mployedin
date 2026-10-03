/**
 * The orchestrator's WhatsApp step. Runs the policy gates in spec §5 order and
 * records a `skipped` log row (with the reason) whenever one fails, so the
 * admin Overview can show why messages did not go out.
 */
import User from "@/models/User";
import WhatsAppMessageLog, { logWhatsAppDelivery } from "@/models/WhatsAppMessageLog";
import { getWhatsAppSettings } from "@/models/SystemConfig";
import { resolveAutomationBinding } from "./automations";
import { hasOptedOut } from "./optOut";
import { toWaRecipient } from "./phone";
import { sendWhatsAppTemplate, sendWhatsAppText } from "./send";
import { firstNameOf, resolveTokens } from "./tokens";
import { rememberWaId } from "./waId";
import { isWithinServiceWindow } from "./window";
import { isWhatsAppNumberVerified } from "./verification";

/** The orchestrator's snapshot supplies the copy fields; `phone` and `whatsapp` are always re-read at send time. */
export interface DeliveryRecipient {
  _id?: unknown;
  name?: string;
  role?: string;
  locale?: string;
  phone?: string;
  whatsapp?: {
    optInAt?: Date | string | null;
    optOutAt?: Date | string | null;
    lastInboundAt?: Date | string | null;
    verifiedNumber?: string | null;
  } | null;
}

export interface DeliveryInput {
  userId: string;
  type: string;
  category: string;
  recipient: DeliveryRecipient | null;
  title: string;
  message: string;
  params?: Record<string, unknown>;
}

export type SkipReason = "disabled_by_admin" | "no_phone" | "invalid_phone" | "opted_out" | "not_verified" | "daily_cap" | "no_template_outside_window";

export type DeliveryOutcome =
  | { status: "sent" | "mock"; messageId: string; via: "template" | "text" }
  | { status: "skipped"; reason: SkipReason }
  | { status: "failed"; reason: string };

const CAP_STATUSES = ["sent", "delivered", "read", "mock"];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records why nothing was sent. A log row needs a `to`, so with no phone there
 * is nothing to record it against, whatever the reason. `to` is stored the way
 * send.ts stores it (`+` and digits) when the number is valid; the raw input
 * stays only when it cannot be normalised (`invalid_phone`).
 */
async function skipped(input: DeliveryInput, reason: SkipReason, phone?: string): Promise<DeliveryOutcome> {
  if (phone) {
    const wa = toWaRecipient(phone);
    await logWhatsAppDelivery({
      userId: input.userId,
      to: wa ? `+${wa}` : phone,
      kind: "template",
      source: "orchestrator",
      category: input.category,
      notificationType: input.type,
      status: "skipped",
      skipReason: reason,
    });
  }
  return { status: "skipped", reason };
}

export async function deliverNotificationWhatsApp(input: DeliveryInput): Promise<DeliveryOutcome> {
  const settings = await getWhatsAppSettings();

  // Consent and the number are read here, at send time, never taken from the
  // orchestrator's snapshot: Inngest stores step output, so the phone and the
  // consent state stay out of it, and a STOP or a number change that lands
  // while a step retries is honoured. Name, role and locale (copy only) still
  // come from the snapshot. The master-switch skip row needs the number too.
  const fresh = (await User.findById(input.userId).select("phone whatsapp").lean()) as Pick<DeliveryRecipient, "phone" | "whatsapp"> | null;
  if (!settings.enabled) return skipped(input, "disabled_by_admin", fresh?.phone);
  // A user deleted since the snapshot has no number to send to.
  if (!fresh?.phone) return skipped(input, "no_phone");
  const r: DeliveryRecipient & { phone: string } = { ...input.recipient, phone: fresh.phone, whatsapp: fresh.whatsapp };

  const recipient = toWaRecipient(r.phone);
  if (!recipient) return skipped(input, "invalid_phone", r.phone);
  if (hasOptedOut(r.whatsapp)) return skipped(input, "opted_out", r.phone);
  // Nothing goes to a typed number until a START from it has proven it is the user's (verification.ts).
  if (!isWhatsAppNumberVerified(r.phone, r.whatsapp?.verifiedNumber)) return skipped(input, "not_verified", r.phone);

  // The cap is per number, not per account (the setting keeps its old name): anyone can type any number on
  // a profile, so several accounts carrying one number must not multiply what it receives. `to` is stored
  // the way send.ts normalises it; the { to, sentAt } index serves this count.
  const sentToday = await WhatsAppMessageLog.countDocuments({
    to: `+${recipient}`,
    source: "orchestrator",
    status: { $in: CAP_STATUSES },
    sentAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
  if (sentToday >= settings.dailyCapPerUser) return skipped(input, "daily_cap", r.phone);

  const common = { userId: input.userId, source: "orchestrator" as const, category: input.category, notificationType: input.type };
  const binding = await resolveAutomationBinding(input.type, r.locale, settings);

  if (binding) {
    const ctx = { ...(input.params ?? {}), firstName: firstNameOf(r.name), fullName: r.name ?? "", role: r.role ?? "", title: input.title, message: input.message };
    const out = await sendWhatsAppTemplate({
      to: r.phone,
      templateName: binding.templateName,
      language: binding.language,
      params: resolveTokens(binding.params, ctx),
      ...common,
    });
    if (out.status === "failed") return { status: "failed", reason: out.error.message };
    // The number is on the suppression list (a STOP from it); send.ts logged the skip.
    if (out.status === "skipped") return { status: "skipped", reason: out.reason };
    await rememberWaId(input.userId, out.waId);
    return { status: out.status, messageId: out.messageId, via: "template" };
  }

  if (isWithinServiceWindow(r.whatsapp?.lastInboundAt)) {
    const out = await sendWhatsAppText({ to: r.phone, body: `${input.title}\n\n${input.message}`, ...common });
    if (out.status === "failed") return { status: "failed", reason: out.error.message };
    if (out.status === "skipped") return { status: "skipped", reason: out.reason };
    await rememberWaId(input.userId, out.waId);
    return { status: out.status, messageId: out.messageId, via: "text" };
  }

  return skipped(input, "no_template_outside_window", r.phone);
}
