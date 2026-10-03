/**
 * Meta requires opt-in before business-initiated messages. The WhatsApp
 * channel toggle on a notification category is a preference, not that opt-in:
 * anyone can type any number on a profile and tick it. Consent is a START sent
 * from the number (webhookHandlers.ts), which Meta's signed webhook ties to the
 * number; STOP withdraws it.
 *
 * What the toggle records in the ConsentLog:
 * - Turning the last WhatsApp channel off records the withdrawal.
 * - Turning the channel back on records a grant only when that really resumes
 *   sends: the number on the profile was verified by a START, the account has
 *   not opted out since, and the number is not on the STOP list
 *   (isWhatsAppReachable). Off, on, off thus reads withdrawn, granted,
 *   withdrawn. For any other account turning it on records nothing.
 * Either way the toggle never stamps `whatsapp.optInAt` and never clears a
 * STOP's `optOutAt`: only a START does. `before === after` (an unrelated
 * preferences save) writes nothing.
 */
import logger from "@/lib/logger";
import User from "@/models/User";
import ConsentLog from "@/models/ConsentLog";
import { isNumberSuppressed } from "@/models/WhatsAppSuppression";
import { hasOptedOut, type WhatsAppConsentState } from "./optOut";
import { isWhatsAppNumberVerified } from "./verification";

type Categories = Record<string, { channels?: string[] } | undefined> | null | undefined;

export function hasWhatsAppChannel(categories: Categories): boolean {
  return Object.values(categories ?? {}).some((c) => Array.isArray(c?.channels) && c.channels.includes("whatsapp"));
}

/** The account fields isWhatsAppReachable reads. */
export interface WhatsAppReachAccount {
  phone?: string | null;
  whatsapp?: (WhatsAppConsentState & { verifiedNumber?: string | null }) | null;
}

/**
 * Whether WhatsApp messages can reach this account, as far as consent goes:
 * a START verified the number on its profile (verification.ts), it has not
 * opted out since (optOut.ts), and the number is not on the STOP list (the
 * same read every send makes, WhatsAppSuppression). The settings pages'
 * "Verified" and the toggle's grant row both use it, so neither says yes while
 * every send would skip. Channels, the master switch and the daily cap are not
 * consent and are not checked. Throws when the list cannot be read.
 */
export async function isWhatsAppReachable(account: WhatsAppReachAccount | null | undefined): Promise<boolean> {
  const verifiedNumber = account?.whatsapp?.verifiedNumber;
  if (!verifiedNumber || !isWhatsAppNumberVerified(account?.phone, verifiedNumber) || hasOptedOut(account?.whatsapp)) return false;
  // Verified, so verifiedNumber is the profile phone as send.ts dials it: the form the list is keyed by.
  return !(await isNumberSuppressed(verifiedNumber));
}

export async function recordWhatsAppOptInChange(input: {
  userId: string;
  before: boolean;
  after: boolean;
  source: string;
  ipAddress?: string;
}): Promise<void> {
  if (input.before === input.after) return;

  // Independent steps, each with its own catch: the withdrawal must not depend
  // on the lookup succeeding, and nothing here may fail the user's save. A grant
  // is written only when it is known to hold, so a failed read writes none.
  let account: (WhatsAppReachAccount & { name?: string }) | null = null;
  try {
    account = (await User.findById(input.userId)
      .select("name phone whatsapp.verifiedNumber whatsapp.optInAt whatsapp.optOutAt")
      .lean()) as (WhatsAppReachAccount & { name?: string }) | null;
  } catch (err) {
    logger.error({ err, userId: input.userId }, "[whatsapp] consent record: account lookup failed");
  }

  if (input.after) {
    if (!account) return;
    let reachable = false;
    try {
      reachable = await isWhatsAppReachable(account);
    } catch (err) {
      logger.error({ err, userId: input.userId }, "[whatsapp] consent record: STOP list unreadable, no grant recorded");
    }
    // Unverified, opted out or listed: the toggle resumes nothing, so it grants nothing.
    if (!reachable) return;
  }

  try {
    await ConsentLog.create({
      userId: input.userId,
      userName: account?.name ?? "Unknown",
      consentType: "whatsapp_messaging",
      granted: input.after,
      source: input.source,
      ipAddress: input.ipAddress,
    });
  } catch (err) {
    logger.error({ err, userId: input.userId }, "[whatsapp] consent record failed");
  }
}
