/**
 * Which captcha provider is active: the single switch behind the swappable
 * captcha abstraction (PECR plan task 11, decision D2).
 *
 * `NEXT_PUBLIC_CAPTCHA_PROVIDER` is read by the browser adapter
 * (lib/browser/captcha.ts) and by the server verifier (lib/security/captcha.ts),
 * and both resolve it here, so the two can never disagree. It is a NEXT_PUBLIC_
 * variable on purpose: that is the only kind the browser can read.
 *
 * Unset means reCAPTCHA. A value this build has no adapter for also means
 * reCAPTCHA, never "no captcha": a typo must not switch the check off. The
 * server logs that once; the browser stays quiet.
 *
 * To add a provider: add its id here, one adapter in lib/browser/captcha.ts
 * and one in lib/security/captcha.ts. Nothing that calls them changes.
 */
export const CAPTCHA_PROVIDER_IDS = ["recaptcha"] as const;
export type CaptchaProviderId = (typeof CAPTCHA_PROVIDER_IDS)[number];
export const DEFAULT_CAPTCHA_PROVIDER: CaptchaProviderId = "recaptcha";

export interface ResolvedCaptchaProvider {
  /** The provider to use. */
  id: CaptchaProviderId;
  /** False only when a non-empty value named a provider this build does not have. */
  recognised: boolean;
  /** The trimmed value as written, "" when unset. */
  raw: string;
}

export function resolveCaptchaProvider(raw: string | undefined | null): ResolvedCaptchaProvider {
  const value = (raw ?? "").trim();
  if (!value) return { id: DEFAULT_CAPTCHA_PROVIDER, recognised: true, raw: "" };
  const match = CAPTCHA_PROVIDER_IDS.find((id) => id === value.toLowerCase());
  return match ? { id: match, recognised: true, raw: value } : { id: DEFAULT_CAPTCHA_PROVIDER, recognised: false, raw: value };
}
