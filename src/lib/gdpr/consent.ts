import ConsentLog from "@/models/ConsentLog";
import logger from "@/lib/logger";
import type { CookieChoice } from "./cookieChoice";

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
}

/**
 * Never throws: the account already exists by the time this runs, and a lost
 * log row must not turn a finished registration into an error.
 */
export async function recordRegistrationConsents(input: RegistrationConsentInput): Promise<void> {
  const base = {
    userId: input.userId,
    userName: input.userName || "Unknown",
    source: "registration",
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
  };
  const rows = [
    ...(input.termsAccepted ? [{ ...base, consentType: CONSENT_TYPES.termsAndPrivacy, granted: true }] : []),
    ...(input.cookieChoice
      ? [{ ...base, consentType: CONSENT_TYPES.cookies, granted: input.cookieChoice === "accepted" }]
      : []),
  ];
  if (rows.length === 0) return;
  try {
    await ConsentLog.insertMany(rows);
  } catch (err) {
    logger.error({ err, userId: input.userId }, "[gdpr] failed to record registration consent");
  }
}
