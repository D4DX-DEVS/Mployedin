/**
 * DB effects of Meta webhook events. Meta redelivers a batch after any non-2xx
 * (the route answers 503 when the database is down, or when a STOP/START could
 * not be applied), so a handler can run twice for one event.
 *
 * Re-applies to the same result: status updates only move forward (a late
 * duplicate matches no row); STOP/START flags, the preference channels
 * ($pull / $addToSet) and `waId` are plain sets; `lastInboundAt` is a $max, so
 * an older redelivered message cannot shorten the 24 h window, and so are a
 * START's `optInAt` and `verifiedAt`, so an older START redelivered after a
 * newer one cannot move them back (and let a STOP between the two apply).
 *
 * Template status events are plain sets on the mirrored row. They carry no
 * timestamp, so a stale redelivery can put an older status back until the next
 * event or "Sync from Meta".
 *
 * Order guard: a keyword changes only the accounts whose opposite choice is not
 * newer. START skips an account whose `optOutAt` is at or after the message;
 * STOP skips one whose `optInAt` is after it, so within the same second STOP
 * wins whichever order they are processed in. A stale redelivery therefore
 * cannot undo a newer choice.
 *
 * A keyword that changes nothing (a redelivery, a second STOP from an account
 * already out, a START from one already in) writes no ConsentLog row and sends
 * no confirmation: both happen only when a write modified an account.
 *
 * A STOP can be applied in part: the opt-out lands, then the preference $pull
 * or the ConsentLog insert throws, and the route answers 503. So on a STOP the
 * $pull (idempotent) runs for every matched account whose opt-in is not newer,
 * including one already out, and the ConsentLog row and the confirmation follow
 * when the opt-out write or the $pull changed something. A redelivery thereby
 * finishes what the first delivery left undone, and a plain repeated STOP, with
 * nothing left to change, still logs and sends nothing. (If only the ConsentLog
 * insert failed, after the $pull had gone through, nothing is left to detect
 * and the row stays missing.)
 *
 * STOP and START also write the number-level list (WhatsAppSuppression), which
 * every send checks: an account's opt-out belongs to the account, the list to
 * the number, whichever profile carries it, and only a START from the number
 * lifts it. A STOP writes it for every STOP, with or without a matching
 * account, before the accounts change; the upsert is idempotent ($max on the
 * time). A START lifts it before the accounts change, as a plain START always
 * and as `START <code>` only when the code verifies an account (below). It
 * keeps the entry and records its own time on it ($max), and the entry holds
 * only while its STOP is not older than that START (the same order guard), so
 * a STOP redelivered after a newer START lists nothing again.
 *
 * A START also verifies the number: Meta signs the webhook, so the sender is
 * proven to hold the number. Since 2026-10-03 each account has a personal code
 * (startCode.ts) that its settings page's button types: `START <code>`
 * verifies only the account holding the code, and only while the message comes
 * from the phone on that account's profile (the send gate's comparison,
 * verification.ts). It records the sender as `whatsapp.verifiedNumber`, and
 * sends go out only while that equals the account's normalised phone. Other
 * accounts on the number are not verified, so typing someone's number into a
 * profile no longer gets an account switched on by their START. A plain START
 * verifies nobody: it resumes the accounts a START already verified for the
 * number (after a STOP). A START that only verifies (an account already in,
 * from the time the channel toggle counted as opt-in) is a change: it is logged
 * and confirmed like any other.
 *
 * A START that is nobody's (a code that is unknown or whose account has another
 * phone, or a plain START from a number no START verified) changes no account,
 * leaves a code's STOP in place, and gets one short reply saying how to do it
 * (sendStartGuidance), except while WhatsApp is paused. A redelivery of that
 * message finds the reply already logged and sends nothing.
 *
 * A START leaves an account's own category choice alone: one with WhatsApp on in
 * any category is verified and consented only. Only an account with no WhatsApp
 * channel on at all (after a STOP, or an employer, agent or super-agent, whose
 * settings have no WhatsApp toggle) gets it on the transactional categories.
 * Decided per account in the write's filter, so accounts sharing a number can
 * end up differently.
 */
import type { Types } from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import logger from "@/lib/logger";
import User from "@/models/User";
import NotificationPreference, { CATEGORY_KEYS, getOrCreatePreferences } from "@/models/NotificationPreference";
import ConsentLog from "@/models/ConsentLog";
import WhatsAppMessageLog from "@/models/WhatsAppMessageLog";
import WhatsAppTemplate from "@/models/WhatsAppTemplate";
import { liftSuppression, suppressNumber } from "@/models/WhatsAppSuppression";
import { getWhatsAppSettings } from "@/models/SystemConfig";
import { isWhatsAppEnabled } from "./config";
import { markMessageRead } from "./cloudApi";
import { classifyWhatsAppError } from "./errors";
import { hasOptedOut } from "./optOut";
import { fromWaId, toWaRecipient } from "./phone";
import { sendWhatsAppText } from "./send";
import { rejectionReason } from "./templateSync";
import { isWhatsAppNumberVerified } from "./verification";
import type { WebhookEvent } from "./webhook";
import { classifyInbound, parseInbound } from "./webhook";

type StatusEvent = Extract<WebhookEvent, { kind: "status" }>;
type InboundEvent = Extract<WebhookEvent, { kind: "inbound_message" }>;
type TemplateEvent = Extract<WebhookEvent, { kind: "template_status_update" }>;

/**
 * Categories START turns WhatsApp on for, in an account with no WhatsApp channel on (see the header). Marketing stays
 * off until the user ticks it themselves.
 */
export const TRANSACTIONAL_CATEGORIES = ["applications", "interviews", "offers", "placements", "commissions", "system"] as const;

const STATUS_RANK: Record<string, number> = { mock: 0, sent: 1, delivered: 2, read: 3, failed: 3 };

const REPLIES = {
  en: {
    stop: "You will no longer receive WhatsApp messages from MPLOYEDIN. Reply START at any time to turn them back on.",
    start: "You'll now get MPLOYEDIN updates on WhatsApp. Reply STOP at any time to turn them off.",
    startGuidance: "We couldn't confirm this number. Use the WhatsApp button on your MPLOYEDIN settings page, from the phone saved on your profile.",
  },
  ar: {
    stop: "لن تصلك رسائل واتساب من MPLOYEDIN بعد الآن. أرسل START في أي وقت لإعادة تفعيلها.",
    start: "ستصلك الآن تحديثات MPLOYEDIN على واتساب. أرسل STOP في أي وقت لإيقافها.",
    startGuidance: "تعذّر تأكيد هذا الرقم. استخدم زر واتساب في صفحة الإعدادات على MPLOYEDIN، من الهاتف المحفوظ في ملفك الشخصي.",
  },
} as const;

/** The log rows of the START guidance reply (`notificationType`), which a redelivery looks for. */
const START_GUIDANCE = "start_guidance";

export async function applyStatusEvent(ev: StatusEvent): Promise<void> {
  if (ev.status === "deleted") return;
  const rank = STATUS_RANK[ev.status];
  const lower = Object.entries(STATUS_RANK)
    .filter(([, r]) => r < rank)
    .map(([s]) => s);
  const $set: Record<string, unknown> = { status: ev.status, statusAt: ev.timestamp };
  if (ev.errorCode !== undefined) {
    $set.errorCode = ev.errorCode;
    $set.errorKind = classifyWhatsAppError(ev.errorCode).kind;
  }
  if (ev.errorMessage) $set.errorMessage = ev.errorMessage;
  if (ev.conversationCategory) $set.conversationCategory = ev.conversationCategory;
  await WhatsAppMessageLog.updateOne({ waMessageId: ev.waMessageId, status: { $in: lower } }, { $set });
}

interface LeanUser {
  _id: Types.ObjectId;
  name?: string;
  locale?: string;
  phone?: string | null;
  whatsapp?: { optInAt?: Date | null; optOutAt?: Date | null; verifiedNumber?: string | null };
}

/** What the handlers read of an account: the consent row's name, the reply's language, the START rules' phone and verified number, the order guard's times. */
const ACCOUNT_FIELDS = "_id name locale phone whatsapp.optInAt whatsapp.optOutAt whatsapp.verifiedNumber";

/** Meta's `wa_id`: the number as digits, country code first, no plus (E.164 is at most 15 digits). */
const WA_ID = /^\d{6,15}$/;

/** Digits in order, with any non-digits allowed between them. */
function spaced(digits: string): string {
  return digits.split("").join("\\D*");
}

/**
 * `User.phone` is stored as typed (spaces, dashes, brackets, with or without
 * "+", often with the national trunk zero kept after the country code, as in
 * "+971 (0) 50 123 4567"), so an exact match misses real accounts. This matches
 * the country code, an optional trunk "0", then the national digits, in order,
 * with any non-digits around and between them. The country code comes from
 * libphonenumber (the same metadata `toWaRecipient` sends with); if it cannot be
 * told, the whole id is matched as plain digits. Only digits go into the pattern
 * (`WA_ID` is checked first), so nothing in it is a regex operator, and `\D*`
 * never overlaps a digit, so it cannot backtrack badly.
 */
function phonePattern(waId: string): RegExp {
  const callingCode = parsePhoneNumberFromString(`+${waId}`)?.countryCallingCode;
  if (callingCode && waId.startsWith(callingCode) && waId.length > callingCode.length) {
    const national = waId.slice(callingCode.length);
    return new RegExp(`^\\D*${spaced(callingCode)}\\D*(?:0\\D*)?${spaced(national)}\\D*$`);
  }
  return new RegExp(`^\\D*${spaced(waId)}\\D*$`);
}

/**
 * The accounts a number belongs to: the digit-tolerant pattern on the typed
 * `User.phone`, or Meta's `wa_id` stored from an earlier send or message, which
 * can differ from the typed number (Mexico's 521…, Brazil, Argentina). Shared
 * by STOP/START and the admin test send, so both see the same accounts.
 */
export function numberMatchFilter(waId: string): { $or: [{ phone: RegExp }, { "whatsapp.waId": string }] } {
  // Only digits may reach the pattern (see phonePattern).
  if (!WA_ID.test(waId)) throw new Error("numberMatchFilter needs a wa_id: 6-15 digits");
  return { $or: [{ phone: phonePattern(waId) }, { "whatsapp.waId": waId }] };
}

/** True when `at` is not set, or lies before `ts` (also at `ts` when `orEqual`). */
function unsetOrBefore(at: Date | null | undefined, ts: Date, orEqual = false): boolean {
  if (!at) return true;
  const t = new Date(at).getTime();
  return orEqual ? t <= ts.getTime() : t < ts.getTime();
}

const replyLang = (u: LeanUser): "ar" | "en" => (u.locale === "ar" ? "ar" : "en");

/**
 * The sender as send.ts normalises a recipient, so the list entry matches the number every send checks
 * and the verified number matches the phone the send gate normalises the same way.
 */
function senderNumber(waId: string): string {
  const recipient = toWaRecipient(fromWaId(waId));
  return recipient ? `+${recipient}` : fromWaId(waId);
}

/** An account the STOP still has to opt out (the others are already out, and only get their channels checked). */
const notYetOut = (u: LeanUser): boolean => !hasOptedOut(u.whatsapp);

/**
 * STOP for these accounts (their opt-in is not newer): out everywhere, consent
 * withdrawn, one confirmation to the number. An account already out is still
 * checked for WhatsApp channels left on, because the delivery that opted it out
 * may have failed before the $pull (see the header).
 */
async function applyStop(users: LeanUser[], ev: InboundEvent): Promise<void> {
  const pull: Record<string, string> = {};
  for (const c of CATEGORY_KEYS) pull[`categories.${c}.channels`] = "whatsapp";
  const pullChannels = (list: LeanUser[]) => NotificationPreference.updateMany({ userId: { $in: list.map((u) => u._id) } }, { $pull: pull });

  const fresh = users.filter(notYetOut);
  const already = users.filter((u) => !notYetOut(u));
  const changed = new Set<LeanUser>();
  if (fresh.length > 0) {
    const res = await User.updateMany(
      { _id: { $in: fresh.map((u) => u._id) } },
      { $set: { "whatsapp.optOutAt": ev.timestamp, "whatsapp.waId": ev.fromWaId }, $max: { "whatsapp.lastInboundAt": ev.timestamp } },
    );
    const prefs = await pullChannels(fresh);
    // Neither modified: a concurrent copy of this message got there first, and it logs and confirms.
    if (res.modifiedCount > 0 || prefs.modifiedCount > 0) for (const u of fresh) changed.add(u);
  }
  if (already.length > 0 && (await pullChannels(already)).modifiedCount > 0) for (const u of already) changed.add(u);
  if (changed.size === 0) return;

  const logged = users.filter((u) => changed.has(u));
  for (const u of logged) {
    await ConsentLog.create({ userId: u._id, userName: u.name ?? "Unknown", consentType: "whatsapp_messaging", granted: false, source: "whatsapp_stop" });
  }
  // One message to the number, in the language of the first account by id. The number is on the
  // suppression list by now, and the confirmation is part of the opt-out: it alone bypasses the list.
  await sendWhatsAppText({ to: fromWaId(ev.fromWaId), body: REPLIES[replyLang(logged[0])].stop, userId: String(logged[0]._id), source: "auto_reply", category: "system", bypassSuppression: true });
}

/**
 * START for these accounts: verified, consent granted, one confirmation to the number; WhatsApp on the transactional
 * categories only for an account that has it on nowhere (see the header).
 */
async function applyStart(users: LeanUser[], ev: InboundEvent): Promise<void> {
  const ids = users.map((u) => u._id);
  const verified = senderNumber(ev.fromWaId);
  // Off before this message: opted out, never opted in, or not yet verified for this number.
  const wasOff = users.some((u) => hasOptedOut(u.whatsapp) || !u.whatsapp?.optInAt || u.whatsapp?.verifiedNumber !== verified);
  const res = await User.updateMany(
    { _id: { $in: ids } },
    {
      $unset: { "whatsapp.optOutAt": 1 },
      $set: {
        "whatsapp.optInSource": "whatsapp_start",
        "whatsapp.waId": ev.fromWaId,
        "whatsapp.verifiedNumber": verified,
      },
      // $max: an older START redelivered after a newer one cannot move these back (see the header).
      $max: { "whatsapp.lastInboundAt": ev.timestamp, "whatsapp.optInAt": ev.timestamp, "whatsapp.verifiedAt": ev.timestamp },
    },
  );
  for (const u of users) await getOrCreatePreferences(String(u._id));
  const add: Record<string, string> = {};
  for (const c of TRANSACTIONAL_CATEGORIES) add[`categories.${c}.channels`] = "whatsapp";
  // Only accounts with no WhatsApp channel in any category: the condition sits in the write's filter, so it is judged
  // per document and atomically (a channel ticked in settings a moment earlier is not widened).
  const noWhatsAppChannel = { $nor: CATEGORY_KEYS.map((c) => ({ [`categories.${c}.channels`]: "whatsapp" })) };
  const prefs = await NotificationPreference.updateMany({ userId: { $in: ids }, ...noWhatsAppChannel }, { $addToSet: add });
  // Changed nothing: already in and verified, with no channels to add, or a concurrent copy of this message got there first.
  if (!((wasOff && res.modifiedCount > 0) || prefs.modifiedCount > 0)) return;
  for (const u of users) {
    await ConsentLog.create({ userId: u._id, userName: u.name ?? "Unknown", consentType: "whatsapp_messaging", granted: true, source: "whatsapp_start" });
  }
  // While the admin has WhatsApp paused, "you'll now get updates" would not be true: the opt-in stands, the reply waits.
  if (!(await getWhatsAppSettings()).enabled) return;
  // Bypasses the list like the STOP reply: a START older than the STOP on record leaves the number listed.
  await sendWhatsAppText({ to: fromWaId(ev.fromWaId), body: REPLIES[replyLang(users[0])].start, userId: String(users[0]._id), source: "auto_reply", category: "system", bypassSuppression: true });
}

/**
 * The accounts a START is for (see the header):
 * - `START <code>`: the account holding the code, only while the message comes
 *   from the phone on its profile (the send gate's comparison). It is looked up
 *   by its code, not among the accounts the number matched: the phone decides.
 * - a plain START: the accounts on the number that a START already verified
 *   for it, still matching their profile phone. It verifies nobody new.
 */
async function startOwners(users: LeanUser[], code: string | undefined, sender: string): Promise<LeanUser[]> {
  if (code) {
    // `$type` matches the unique index's partial filter; without it MongoDB cannot use that index and scans every user.
    const account = (await User.findOne({ "whatsapp.startCode": { $eq: code, $type: "string" } }).select(ACCOUNT_FIELDS).lean()) as LeanUser | null;
    return account && isWhatsAppNumberVerified(account.phone, sender) ? [account] : [];
  }
  return users.filter((u) => u.whatsapp?.verifiedNumber === sender && isWhatsAppNumberVerified(u.phone, sender));
}

/**
 * The reply to a START that is nobody's (see the header): how to do it, in the
 * language of the first account on the number (English when there is none).
 * Not while the admin has WhatsApp paused (the rule the START confirmation
 * follows). It answers the number's own START, so it bypasses the list like the
 * confirmations. Once per message: a redelivery finds this reply already logged
 * to the number at or after the message's time, and sends nothing.
 */
async function sendStartGuidance(users: LeanUser[], ev: InboundEvent, sender: string): Promise<void> {
  if (!(await getWhatsAppSettings()).enabled) return;
  if (await WhatsAppMessageLog.exists({ to: sender, source: "auto_reply", notificationType: START_GUIDANCE, sentAt: { $gte: ev.timestamp } })) return;
  const first = users[0];
  const body = REPLIES[first ? replyLang(first) : "en"].startGuidance;
  await sendWhatsAppText({ to: fromWaId(ev.fromWaId), body, ...(first ? { userId: String(first._id) } : {}), source: "auto_reply", category: "system", notificationType: START_GUIDANCE, bypassSuppression: true });
}

/**
 * Every inbound message opens the 24 h service window (spec §5, gate 7), including a keyword that changed nothing.
 * $max: an older message redelivered after a newer one must not shorten it.
 */
async function openWindow(list: LeanUser[], ev: InboundEvent): Promise<void> {
  if (list.length === 0) return;
  await User.updateMany({ _id: { $in: list.map((u) => u._id) } }, { $max: { "whatsapp.lastInboundAt": ev.timestamp }, $set: { "whatsapp.waId": ev.fromWaId } });
}

export async function applyInboundMessage(ev: InboundEvent): Promise<void> {
  if (isWhatsAppEnabled()) {
    // Best effort: a read receipt is courtesy, never a reason to fail the webhook.
    markMessageRead(ev.waMessageId).catch((err) => logger.warn({ err }, "[whatsapp] mark-read failed"));
  }

  // The phone number is personal data: no log line below carries it.
  if (!WA_ID.test(ev.fromWaId)) {
    logger.warn("[whatsapp] inbound message ignored: the sender id is not a phone number");
    return;
  }
  const inbound = parseInbound(ev);
  const keyword = inbound?.keyword ?? null;
  const sender = senderNumber(ev.fromWaId);
  // A STOP writes the number-level list first (see the header), for a number with no account too. A failed
  // write throws, and processWebhookEvents reports the keyword as failed so Meta redelivers it.
  if (keyword === "stop") await suppressNumber(sender, ev.timestamp, "stop_keyword");
  const found = (await User.find(numberMatchFilter(ev.fromWaId)).select(ACCOUNT_FIELDS).lean()) as LeanUser[];
  // Accounts can share a number (a duplicate sign-up, a family phone): every one of them hears STOP, and a START
  // reaches the ones startOwners picks.
  const users = [...found].sort((a, b) => String(a._id).localeCompare(String(b._id)));

  const owners = keyword === "start" ? await startOwners(users, inbound?.code, sender) : [];
  // A plain START is the number's own word, so it lifts the number's STOP whoever it resumes; a code lifts it only
  // when it verifies an account (a failed write throws, as for STOP).
  if (keyword === "start" && (!inbound?.code || owners.length > 0)) await liftSuppression(sender, ev.timestamp);
  if (keyword === "start" && owners.length === 0) {
    // No number and no code in the line.
    logger.info(
      { keyword },
      inbound?.code ? "[whatsapp] START code matched no account with this phone: nothing verified" : "[whatsapp] plain START from a number no START verified: nothing resumed",
    );
    await sendStartGuidance(users, ev, sender);
    await openWindow(users, ev);
    return;
  }

  if (found.length === 0 && keyword !== "start") {
    // A STOP that reaches nobody means the sender believes they opted out: worth seeing in the logs.
    if (keyword) logger.info({ keyword }, "[whatsapp] keyword from a number with no account");
    else logger.debug("[whatsapp] inbound message from a number with no account");
    return;
  }

  // The keyword changes only accounts whose opposite choice is not newer (see the header: ordering guard).
  const targets =
    keyword === "stop"
      ? users.filter((u) => unsetOrBefore(u.whatsapp?.optInAt, ev.timestamp, true))
      : keyword === "start"
        ? owners.filter((u) => unsetOrBefore(u.whatsapp?.optOutAt, ev.timestamp))
        : [];
  // A STOP writes the User only for accounts not yet out (a repeated STOP is not logged or confirmed again, though
  // its channels are still checked); the rest get the window update below. By id: a START's account may come from
  // its code lookup rather than from `users`.
  const written = keyword === "stop" ? targets.filter(notYetOut) : targets;
  const writtenIds = new Set(written.map((u) => String(u._id)));
  const rest = users.filter((u) => !writtenIds.has(String(u._id)));
  if (keyword && rest.length > 0) {
    const note = "[whatsapp] keyword left some accounts unchanged: a newer opposite choice, already in that state, or not the account a START is for";
    // A STOP that changed nothing is worth seeing: the sender believes they opted out.
    if (keyword === "stop") logger.info({ keyword }, note);
    else logger.debug({ keyword }, note);
  }

  if (targets.length > 0) {
    if (keyword === "stop") await applyStop(targets, ev);
    else await applyStart(targets, ev);
  }

  await openWindow(rest, ev);
}

/**
 * Meta sends APPROVED | REJECTED | PAUSED | DISABLED | IN_APPEAL | PENDING_DELETION | REINSTATED | FLAGGED.
 * Matches the mirrored row by (name, language) and never creates one: a template
 * the app has not synced yet appears with the next "Sync from Meta".
 */
export async function applyTemplateStatusUpdate(ev: TemplateEvent): Promise<void> {
  const raw = ev.event.trim().toUpperCase();
  // The parser turns a missing event into "": never write that over a real status.
  if (!raw) return;
  const status = raw === "REINSTATED" ? "APPROVED" : raw;
  const reason = rejectionReason(ev.reason);
  const $set: Record<string, unknown> = { status, lastSyncedAt: new Date() };
  if (reason) $set.rejectedReason = reason;
  // An approval carries no reason (Meta says NONE): drop the one a past rejection left.
  const update = reason || status !== "APPROVED" ? { $set } : { $set, $unset: { rejectedReason: "" } };
  await WhatsAppTemplate.updateOne({ name: ev.name, language: ev.language }, update);
}

/**
 * Applies each event on its own: one failure does not stop the rest. A failed
 * STOP/START is reported as `keywordFailed` so the route answers 503 and Meta
 * redelivers (a dropped STOP breaks the opt-out promise); other failures are
 * not, since a redelivery would most likely fail the same way.
 */
export async function processWebhookEvents(
  events: WebhookEvent[],
): Promise<{ statuses: number; inbound: number; templates: number; keywordFailed: boolean }> {
  const counts = { statuses: 0, inbound: 0, templates: 0 };
  let keywordFailed = false;
  for (const ev of events) {
    try {
      if (ev.kind === "status") {
        counts.statuses += 1;
        await applyStatusEvent(ev);
      } else if (ev.kind === "inbound_message") {
        counts.inbound += 1;
        await applyInboundMessage(ev);
      } else {
        counts.templates += 1;
        await applyTemplateStatusUpdate(ev);
      }
    } catch (err) {
      logger.error({ err, kind: ev.kind }, "[whatsapp] webhook event failed");
      if (ev.kind === "inbound_message" && classifyInbound(ev) !== null) keywordFailed = true;
    }
  }
  return { ...counts, keywordFailed };
}
