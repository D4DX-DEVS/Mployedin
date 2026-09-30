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
