import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import logger from "@/lib/logger";
import type { CookieChoice } from "./cookieChoice";
import { getCurrentTermsVersion } from "./termsVersion";

/**
 * Consent rows written when an account is created, so the admin GDPR page's
 * Consent Logs show that a new user accepted the Terms of Service and Privacy
 * Policy (the sign-up checkbox) and what they chose on the cookie banner.
 *
 * Before this, the checkbox was enforced only in the browser and nothing was
 * stored: the Consent Logs held marketing-consent changes and nothing else.
 */
export const CONSENT_TYPES = {
  termsAndPrivacy: "terms_and_privacy",
  cookies: "cookies",
  marketing: "marketing",
} as const;

/**
 * Cookie-choice rows for a signed-in user's account log, one per optional
 * category. Written by POST /api/consent/receipt next to the anonymous receipt.
 * The older single "cookies" row (granted = accepted) is still what sign-up
 * records from the two-value cookieChoice.
 */
export const COOKIE_CONSENT_TYPES = {
  preferences: "cookies.preferences",
  media: "cookies.media",
} as const;

/** The banner / Cookie Policy version a cookie row was given against. [LEGAL] bump with the policy text. */
export const COOKIE_POLICY_VERSION = "cookie-v1";

export type CookieConsentSource = "banner" | "settings";

/**
 * Log a signed-in user's cookie choice on their account. No IP address
 * (minimisation: the receipt is the evidence, this row only ties it to the
 * account). Both rows carry the choice reference (`receiptId`), which is how an
 * admin goes from a row to the receipt that shows what wording was on screen.
 * Never throws: the choice is already stored on the device and in the receipt,
 * and a lost log row must not fail the request. Writes nothing when this user's
 * log already holds rows for this reference.
 */
export async function recordCookieConsent(input: {
  userId: string;
  /** The choice reference: ConsentReceipt.receiptId, the id in the visitor's mpl_consent cookie. */
  receiptId: string;
  preferences: boolean;
  media: boolean;
  source: CookieConsentSource;
}): Promise<void> {
  try {
    // Idempotent per choice reference: the receipt route can be asked for the same receipt again (a resend
    // after a failed delivery), and the account log must not show one choice twice.
    const already = await ConsentLog.exists({
      userId: input.userId,
      receiptId: input.receiptId,
      consentType: { $in: [COOKIE_CONSENT_TYPES.preferences, COOKIE_CONSENT_TYPES.media] },
    });
    if (already) return;
    const user = (await User.findById(input.userId).select("name").lean()) as { name?: string } | null;
    const base = {
      userId: input.userId,
      userName: user?.name || "Unknown",
    };
    // Unordered: with the unique (userId, receiptId, consentType) index, a row a racing resend already wrote must
    // not stop the other category's row.
    await ConsentLog.insertMany(
      [
        { ...base, consentType: COOKIE_CONSENT_TYPES.preferences, granted: input.preferences, source: input.source, policyVersion: COOKIE_POLICY_VERSION, receiptId: input.receiptId },
        { ...base, consentType: COOKIE_CONSENT_TYPES.media, granted: input.media, source: input.source, policyVersion: COOKIE_POLICY_VERSION, receiptId: input.receiptId },
      ],
      { ordered: false },
    );
  } catch (err) {
    // A duplicate key means a racing request already wrote these rows: the choice is recorded.
    if (isDuplicateKeyOnly(err)) return;
    logger.error({ err, userId: input.userId }, "[gdpr] couldn't record the cookie choice on the account");
  }
}

/** True when every failed write was a duplicate key (11000), the only error a racing resend can cause. */
function isDuplicateKeyOnly(err: unknown): boolean {
  const e = err as { code?: number; writeErrors?: Array<{ code?: number }> } | null;
  if (!e) return false;
  if (Array.isArray(e.writeErrors) && e.writeErrors.length > 0) return e.writeErrors.every((w) => w.code === 11000);
  return e.code === 11000;
}

export interface RegistrationConsentInput {
  userId: string;
  userName: string;
  /** Only true when the form sent it; an absent flag records nothing rather than guessing. */
  termsAccepted: boolean;
  cookieChoice?: CookieChoice | null;
  ipAddress?: string;
  /** How the account was made, e.g. "registration:google"; defaults to "registration". */
  source?: string;
}

/**
 * Never throws: the account already exists by the time this runs, and a lost
 * log row must not turn a finished registration into an error. When the terms
 * row cannot be tied to a version, the user is simply asked on /accept-terms.
 */
export async function recordRegistrationConsents(input: RegistrationConsentInput): Promise<void> {
  const base = {
    userId: input.userId,
    userName: input.userName || "Unknown",
    source: input.source ?? "registration",
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
  };
  const policyVersion = input.termsAccepted ? await getCurrentTermsVersion() : null;
  const rows = [
    ...(input.termsAccepted
      ? [{ ...base, consentType: CONSENT_TYPES.termsAndPrivacy, granted: true, ...(policyVersion ? { policyVersion } : {}) }]
      : []),
    ...(input.cookieChoice
      ? [{ ...base, consentType: CONSENT_TYPES.cookies, granted: input.cookieChoice === "accepted" }]
      : []),
  ];
  if (rows.length === 0) return;
  try {
    await ConsentLog.insertMany(rows);
  } catch (err) {
    logger.error({ err, userId: input.userId }, "[gdpr] failed to record registration consent");
    return;
  }
  if (!policyVersion) return;
  try {
    await User.updateOne(
      { _id: input.userId },
      { $set: { termsAcceptedVersion: policyVersion, termsAcceptedAt: new Date() } },
    );
  } catch (err) {
    logger.error({ err, userId: input.userId }, "[gdpr] failed to store the accepted terms version");
  }
}

export interface TermsAcceptanceResult {
  version: string;
  /** False when the user had already accepted this version (nothing written). */
  recorded: boolean;
}

/**
 * The user ticked "I accept" on /accept-terms. Idempotent: a second call for
 * the same version (double click, second tab) writes nothing.
 *
 * The user row is claimed first with a conditional update, so two concurrent
 * calls log one row between them; if the log row then fails, the claim is
 * undone, because an acceptance with no record of it is worse than being asked
 * again.
 */
export async function acceptCurrentTerms(input: { userId: string; ipAddress?: string }): Promise<TermsAcceptanceResult> {
  const version = await getCurrentTermsVersion();
  if (!version) throw new Error("The current terms version could not be read");

  const user = await User.findById(input.userId)
    .select("name termsAcceptedVersion termsAcceptedAt")
    .lean<{ name?: string; termsAcceptedVersion?: string; termsAcceptedAt?: Date } | null>();
  if (!user) throw new Error("User not found");
  if (user.termsAcceptedVersion === version) return { version, recorded: false };

  const claim = await User.updateOne(
    { _id: input.userId, termsAcceptedVersion: { $ne: version } },
    { $set: { termsAcceptedVersion: version, termsAcceptedAt: new Date() } },
  );
  if (claim.modifiedCount === 0) {
    // Lost a race to a concurrent accept — or the write never landed (a model
    // compiled before termsAcceptedVersion existed strips the $set until the
    // server restarts). Only the first is a success.
    const now = await User.findById(input.userId)
      .select("termsAcceptedVersion")
      .lean<{ termsAcceptedVersion?: string } | null>();
    if (now?.termsAcceptedVersion === version) return { version, recorded: false };
    throw new Error("The accepted terms version was not saved");
  }

  try {
    await ConsentLog.create({
      userId: input.userId,
      userName: user.name || "Unknown",
      consentType: CONSENT_TYPES.termsAndPrivacy,
      granted: true,
      // "terms_update" once they had accepted an earlier version; otherwise this
      // is their first acceptance (staff-made or pre-logging account).
      source: user.termsAcceptedVersion ? "terms_update" : "first_sign_in",
      policyVersion: version,
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    });
  } catch (err) {
    await User.updateOne(
      { _id: input.userId, termsAcceptedVersion: version },
      user.termsAcceptedVersion
        ? { $set: { termsAcceptedVersion: user.termsAcceptedVersion, termsAcceptedAt: user.termsAcceptedAt } }
        : { $unset: { termsAcceptedVersion: 1, termsAcceptedAt: 1 } },
    ).catch((undoErr) => logger.error({ err: undoErr, userId: input.userId }, "[gdpr] could not undo a terms claim"));
    throw err;
  }
  return { version, recorded: true };
}
