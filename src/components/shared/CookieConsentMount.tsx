import { getTranslations } from "next-intl/server";
import CookieConsent from "./CookieConsent";

/**
 * The cookie banner for any route group. Public pages, sign-up and sign-in,
 * onboarding and the dashboards all mount it, so a visitor who lands straight
 * on /register (a referral link) or a staff-created user who never saw the
 * public site still answers it. Labels are translated here, on the server,
 * so no group has to ship the `landing` namespace to the client for four strings.
 */
export async function CookieConsentMount({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });
  return (
    <CookieConsent
      locale={locale}
      labels={{
        message: t("cookieConsent"),
        policy: t("cookiePolicy"),
        accept: t("cookieAccept"),
        decline: t("cookieDecline"),
      }}
    />
  );
}
