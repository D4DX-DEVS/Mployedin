"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { getCaptchaNotice, isCaptchaEnabled, type CaptchaNoticeLink } from "@/lib/browser/captcha";
import { cn } from "@/lib/utils";

// Private-use code points that stand in for the two links while the message is
// formatted, so a translation may put them wherever its grammar wants them:
// U+E000 = the {privacy} link, U+E001 = the {terms} link. They never reach the
// screen; the split below swaps each for its <a>.
const PRIVACY_SLOT = "";
const TERMS_SLOT = "";

interface CaptchaNoticeProps {
  className?: string;
}

/**
 * "Protected by reCAPTCHA. Google's Privacy Policy and Terms apply." with both
 * policies linked, shown under the control that triggers the captcha (EasyApply's
 * Send code, the contact form's Send). It follows the active provider (wording
 * keys and links come from lib/browser/captcha.ts) and renders only when a
 * captcha will actually run, so a build without a site key says nothing.
 */
export function CaptchaNotice({ className }: CaptchaNoticeProps) {
  const t = useTranslations("common");
  if (!isCaptchaEnabled()) return null;

  const spec = getCaptchaNotice();
  const parts = t(spec.messageKey, { privacy: PRIVACY_SLOT, terms: TERMS_SLOT }).split(/([])/);

  const link = (item: CaptchaNoticeLink) => (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {t(item.labelKey)}
      <span className="sr-only"> {t("opensInNewTab")}</span>
    </a>
  );

  return (
    <p className={cn("text-xs leading-5 text-muted-foreground", className)}>
      {parts.map((part, index) => (
        <Fragment key={index}>{part === PRIVACY_SLOT ? link(spec.privacy) : part === TERMS_SLOT ? link(spec.terms) : part}</Fragment>
      ))}
    </p>
  );
}
