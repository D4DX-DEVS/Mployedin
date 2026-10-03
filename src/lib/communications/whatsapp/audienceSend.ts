/**
 * Send one template to a batch of users — the WhatsApp leg shared by the admin
 * broadcast worker and the schedule runner. The admin master switch (settings
 * `enabled`, read once per call) gates the whole call. Eligibility per user
 * (spec §6): the user's `system` category is not switched off and lists
 * "whatsapp", they have a phone, and they have not opted out by STOP (the same
 * `hasOptedOut` rule the per-user notification path applies, so a STOP is
 * honoured identically everywhere), and an admin has not force-unsubscribed
 * them (the override the orchestrator honours for every channel). Last, the
 * number must be verified by a START from it (verification.ts, the same rule as
 * the per-user path): an unverified one is a skip with a `not_verified` row.
 * ≤ 10 sends in flight keeps us far under Meta's 80 msg/s default.
 *
 * Callers pass users read from the database for this batch: `phone` and
 * `whatsapp` decide who is sent to, so they must not come from an event payload
 * that may have gone stale since it was queued.
 *
 * A number that cannot be normalised is a skip (`invalid_phone` log row), not a
 * failure: no send is attempted, as it never could succeed.
 */
import logger from "@/lib/logger";
import NotificationPreference from "@/models/NotificationPreference";
import { logWhatsAppDelivery } from "@/models/WhatsAppMessageLog";
import { getForceUnsubscribedUserIds, getWhatsAppSettings } from "@/models/SystemConfig";
import { forEachBounded } from "@/lib/cron/scale";
import { hasOptedOut, type WhatsAppConsentState } from "./optOut";
import { toWaRecipient } from "./phone";
import { sendWhatsAppTemplate } from "./send";
import { firstNameOf, resolveTokens } from "./tokens";
import { isWhatsAppNumberVerified } from "./verification";
import { rememberWaId } from "./waId";

export interface AudienceUser {
  _id: unknown;
  name?: string;
  role?: string;
  phone?: string;
  locale?: string;
  whatsapp?: (WhatsAppConsentState & { verifiedNumber?: string | null }) | null;
}

export interface AudienceTemplate {
  templateName: string;
  language: string;
  /** Body parameters, tokens allowed. Empty for a template with no variables. */
  params: string[];
}

export interface AudienceSendContext {
  source: "broadcast" | "schedule";
  category?: string;
  broadcastId?: string;
  scheduleId?: string;
  /** Extra token values (e.g. the broadcast title/message). Per-user tokens win. */
  tokens?: Record<string, unknown>;
}

export async function sendWhatsAppToUsers(
  users: AudienceUser[],
  template: AudienceTemplate,
  ctx: AudienceSendContext,
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (users.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  // The admin kill switch applies to broadcasts and schedules as it does to
  // per-user notifications. getWhatsAppSettings fails closed (enabled: false)
  // when the config cannot be read.
  const settings = await getWhatsAppSettings();
  if (!settings.enabled) {
    logger.warn(
      { source: ctx.source, broadcastId: ctx.broadcastId, scheduleId: ctx.scheduleId, skipped: users.length },
      "[whatsapp] audience send skipped: WhatsApp is switched off in settings",
    );
    return { sent: 0, failed: 0, skipped: users.length };
  }

  const prefs = (await NotificationPreference.find({
    userId: { $in: users.map((u) => u._id) },
    unsubscribedAll: { $ne: true },
    // $ne: false, not true: a stored document may lack the field (it defaults to on).
    "categories.system.enabled": { $ne: false },
    "categories.system.channels": "whatsapp",
  })
    .select("userId")
    .lean()) as Array<{ userId: unknown }>;
  const optedIn = new Set(prefs.map((p) => String(p.userId)));
  // One config read for the batch, not getUserOverride per recipient.
  const forced = await getForceUnsubscribedUserIds();

  const eligible = users.filter((u) => optedIn.has(String(u._id)) && !forced.has(String(u._id)) && u.phone && !hasOptedOut(u.whatsapp));
  const valid = eligible.filter((u) => toWaRecipient(u.phone) !== null);
  const sendable = valid.filter((u) => isWhatsAppNumberVerified(u.phone, u.whatsapp?.verifiedNumber));
  const skipRow = (u: AudienceUser, to: string, skipReason: "invalid_phone" | "not_verified") =>
    logWhatsAppDelivery({
      userId: String(u._id),
      to,
      kind: "template",
      templateName: template.templateName,
      templateLanguage: template.language,
      source: ctx.source,
      category: ctx.category ?? "system",
      broadcastId: ctx.broadcastId,
      scheduleId: ctx.scheduleId,
      status: "skipped",
      skipReason,
    });
  await Promise.all([
    // Raw input stays on the row, as send.ts does: there is no valid number to normalise.
    ...eligible.filter((u) => !valid.includes(u)).map((u) => skipRow(u, u.phone as string, "invalid_phone")),
    // `to` normalised the way send.ts stores it.
    ...valid.filter((u) => !sendable.includes(u)).map((u) => skipRow(u, `+${toWaRecipient(u.phone)}`, "not_verified")),
  ]);
  const skipped = users.length - sendable.length;
  // Numbers send.ts found on the suppression list (a STOP from the number): skipped, not sent.
  let suppressed = 0;

  const result = await forEachBounded(
    sendable,
    10,
    async (u) => {
      const params = resolveTokens(template.params, { ...(ctx.tokens ?? {}), firstName: firstNameOf(u.name), fullName: u.name ?? "", role: u.role ?? "" });
      const out = await sendWhatsAppTemplate({
        to: u.phone as string,
        templateName: template.templateName,
        language: template.language,
        params,
        userId: String(u._id),
        source: ctx.source,
        category: ctx.category ?? "system",
        broadcastId: ctx.broadcastId,
        scheduleId: ctx.scheduleId,
      });
      if (out.status === "failed") throw out.error;
      if (out.status === "skipped") {
        suppressed += 1;
        return;
      }
      await rememberWaId(String(u._id), out.waId);
    },
    `whatsapp-${ctx.source}`,
  );

  return { sent: result.ok - suppressed, failed: result.failed, skipped: skipped + suppressed };
}
