/**
 * Referral links now serve two audiences. Everything that turns a code into a
 * URL goes through here so the four pages that used to hard-code
 * `employer-register?ref=` cannot drift apart again.
 */
export type ReferralAudience = "employer" | "job_seeker";
export const REFERRAL_AUDIENCES: readonly ReferralAudience[] = ["employer", "job_seeker"];

/** `MPL-` + 8 hex (legacy default links) or 16 hex (tracked links). */
export const REFERRAL_CODE_RE = /^MPL-[A-Z0-9]{6,16}$/;

/** Client-set, short-lived cookie that carries `?ref=` through an OAuth redirect. */
export const REFERRAL_COOKIE_NAME = "mpl_ref";

export function referralPathFor(audience: ReferralAudience | undefined, locale: string): string {
  const safeLocale = locale || "en";
  return audience === "job_seeker"
    ? `/${safeLocale}/register?ref=`
    : `/${safeLocale}/employer-register?ref=`;
}

export function referralUrlFor(
  link: { code: string; audience?: ReferralAudience },
  locale: string,
  origin: string,
): string {
  return `${origin}${referralPathFor(link.audience, locale)}${encodeURIComponent(link.code)}`;
}
