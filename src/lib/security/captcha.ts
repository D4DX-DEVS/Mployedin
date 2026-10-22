import logger from "@/lib/logger";
import { resolveCaptchaProvider, type CaptchaProviderId } from "@/lib/captcha/provider";
import { isRecaptchaConfigured, verifyRecaptcha } from "@/lib/security/recaptcha";

/**
 * Server-side captcha verification, behind a swappable provider.
 *
 * Routes (quick-apply, the contact form) call verifyCaptcha() and nothing else.
 * Which provider verifies is chosen by NEXT_PUBLIC_CAPTCHA_PROVIDER, the same
 * variable the browser adapter (lib/browser/captcha.ts) reads, so the token a
 * visitor's browser mints is always checked by the provider that minted it.
 * Today there is one adapter, reCAPTCHA v3 (lib/security/recaptcha.ts); a swap is
 * one more adapter below plus the env var.
 *
 * Policy is the adapter's and does not change here: when the provider's secret
 * is configured the check is mandatory and fails closed; when it is not, the
 * check is skipped so environments without keys keep working.
 */
export type CaptchaResult =
  | { ok: true; skipped: boolean; score?: number }
  | { ok: false; status: 403 | 503; error: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED" | "CAPTCHA_UNAVAILABLE" };

export interface VerifyCaptchaOptions {
  /** The action name the browser passed when it asked for the token. */
  action: string;
  /** Request hostname; used only when no site URL is configured at all. */
  hostname: string;
  /** Lowest score accepted, for providers that score. Default 0.3. */
  minScore?: number;
}

interface ServerCaptchaAdapter {
  isConfigured: () => boolean;
  verify: (token: string | undefined | null, opts: VerifyCaptchaOptions) => Promise<CaptchaResult>;
}

const ADAPTERS: Record<CaptchaProviderId, ServerCaptchaAdapter> = {
  recaptcha: {
    isConfigured: () => isRecaptchaConfigured(),
    verify: (token, opts) => verifyRecaptcha(token, opts),
  },
};

let warnedUnknownProvider = false;

function adapter(): ServerCaptchaAdapter {
  const resolved = resolveCaptchaProvider(process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER);
  if (!resolved.recognised && !warnedUnknownProvider) {
    warnedUnknownProvider = true;
    logger.warn(
      { provider: resolved.raw, using: resolved.id },
      "[captcha] unknown NEXT_PUBLIC_CAPTCHA_PROVIDER; using the default provider",
    );
  }
  return ADAPTERS[resolved.id];
}

/** True when the active provider has its secret, i.e. verification is mandatory. */
export function isCaptchaConfigured(): boolean {
  return adapter().isConfigured();
}

export function verifyCaptcha(token: string | undefined | null, opts: VerifyCaptchaOptions): Promise<CaptchaResult> {
  return adapter().verify(token, opts);
}
