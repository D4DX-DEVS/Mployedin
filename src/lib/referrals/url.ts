/**
 * Referral links now serve two audiences. Everything that turns a code into a
 * URL goes through here so the four pages that used to hard-code
 * `employer-register?ref=` cannot drift apart again.
 */
export type ReferralAudience = "employer" | "job_seeker";
export const REFERRAL_AUDIENCES: readonly ReferralAudience[] = ["employer", "job_seeker"];

/** `MPL-` + 8 hex (legacy default links) or 16 hex (tracked links). */
export const REFERRAL_CODE_RE = /^MPL-[A-Z0-9]{6,16}$/;

/**
 * Legacy name of the cookie that used to carry `?ref=` through an OAuth
 * redirect. Nothing writes it any more: a referral code now travels in the URL
 * and in page memory, and is written (inside `mpl_signup_consent`) only when the
 * visitor clicks a LinkedIn / Apple sign-up button. The name is kept so
 * /api/auth/post-login-redirect can still honour and clear one left over from
 * before the change.
 */
// ponytail: remove this constant and the legacy read after one release (no code sets mpl_ref).
export const REFERRAL_COOKIE_NAME = "mpl_ref";

/** Trims and upper-cases a raw `?ref=` value; "" unless it has the shape of a code. */
export function normalizeReferralCode(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : "";
}

/** The job-seeker register page, carrying a valid code as `?ref=`. */
export function registerHrefFor(locale: string, code?: string | null): string {
  const base = `/${locale || "en"}/register`;
  const safe = normalizeReferralCode(code);
  return safe ? `${base}?ref=${encodeURIComponent(safe)}` : base;
}

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
