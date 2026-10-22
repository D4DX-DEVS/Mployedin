/**
 * Browser-side captcha, behind a swappable provider.
 *
 * Callers (EasyApply, the contact form) import only from here. Which provider
 * runs is chosen by NEXT_PUBLIC_CAPTCHA_PROVIDER (default and only adapter today:
 * reCAPTCHA, lib/browser/recaptcha.ts); the server reads the same switch in
 * lib/security/captcha.ts. A swap is one adapter below plus the env var: no flow
 * changes, and applying never stops working.
 *
 * Nothing loads until getCaptchaToken() is called from the visitor's tap
 * (PECR: the provider's script is not requested on page view). Where the
 * provider is not configured the token is null and the server skips its check.
 */
import { getRecaptchaToken, isRecaptchaEnabled } from "@/lib/browser/recaptcha";
import { resolveCaptchaProvider, type CaptchaProviderId } from "@/lib/captcha/provider";

export interface CaptchaNoticeLink {
  href: string;
  /** Key of the link text, in the `common` messages namespace. */
  labelKey: string;
}

/** What the visible "Protected by …" notice says and links to, per provider. */
export interface CaptchaNoticeSpec {
  /** Key in the `common` namespace; its text holds {privacy} and {terms} slots for the two links. */
  messageKey: string;
  privacy: CaptchaNoticeLink;
  terms: CaptchaNoticeLink;
}

interface BrowserCaptchaAdapter {
  isEnabled: () => boolean;
  getToken: (action: string) => Promise<string | null>;
  notice: CaptchaNoticeSpec;
}

const ADAPTERS: Record<CaptchaProviderId, BrowserCaptchaAdapter> = {
  recaptcha: {
    isEnabled: () => isRecaptchaEnabled(),
    getToken: (action) => getRecaptchaToken(action),
    notice: {
      messageKey: "captchaNotice",
      privacy: { href: "https://policies.google.com/privacy", labelKey: "captchaPrivacyLink" },
      terms: { href: "https://policies.google.com/terms", labelKey: "captchaTermsLink" },
    },
  },
};

/** Read on each call: cheap, and Next inlines NEXT_PUBLIC_ variables at build time. */
export function activeCaptchaProvider(): CaptchaProviderId {
  return resolveCaptchaProvider(process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER).id;
}

function adapter(): BrowserCaptchaAdapter {
  return ADAPTERS[activeCaptchaProvider()];
}

/** True when a captcha will really run on submit (the provider has its public key). */
export function isCaptchaEnabled(): boolean {
  return adapter().isEnabled();
}

/**
 * A token for `action`, or null when captcha is off or the provider could not be
 * reached (blocked, offline). Call it from the submit handler, never on mount.
 */
export function getCaptchaToken(action: string): Promise<string | null> {
  return adapter().getToken(action);
}

/** The notice wording keys and policy links for the active provider. */
export function getCaptchaNotice(): CaptchaNoticeSpec {
  return adapter().notice;
}
