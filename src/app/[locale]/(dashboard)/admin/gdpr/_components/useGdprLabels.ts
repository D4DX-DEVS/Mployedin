import { useTranslations } from "next-intl";
import { responseTimeParts } from "@/lib/gdpr/responseTime";
import type { CookieChoiceOutcome } from "@/lib/gdpr/cookieChoiceOutcome";

/**
 * Words for request types, response times, consent types, consent sources and
 * cookie choices, shared by the tables, the header metrics and the dialogs.
 * Static keys, not t(`type_${x}`): a value stored before a rename must fall
 * back to its raw name instead of throwing a missing-message error.
 */
export function useGdprLabels() {
  const t = useTranslations("adminGdpr");

  const TYPE_LABELS: Record<string, string> = {
    export: t("dataExportLabel"),
    delete: t("erasureLabel"),
    rectification: t("rectificationLabel"),
    restrict: t("restrictProcessingLabel"),
    complaint: t("complaintLabel"),
  };

  const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type.replace(/_/g, " ");

  /** "12 min", "8.4 hrs", "1.3 days"; a dash before anything was handled. */
  const responseTime = (ms: number | null): string => {
    const parts = responseTimeParts(ms);
    if (!parts) return "—";
    // `count` picks the plural form ("1 day", Arabic dual); `value` is what is
    // printed, so the digits match the plain numbers in the other metrics.
    const args = { value: parts.value, count: Number(parts.value) };
    if (parts.unit === "minutes") return t("responseTimeMinutes", args);
    if (parts.unit === "hours") return t("responseTimeHours", args);
    return t("responseTimeDays", args);
  };

  const CONSENT_TYPE_LABELS: Record<string, string> = {
    terms_and_privacy: t("consentTypeTermsAndPrivacy"),
    cookies: t("consentTypeCookies"),
    "cookies.preferences": t("consentTypeCookiesPreferences"),
    "cookies.media": t("consentTypeCookiesMedia"),
    marketing: t("consentTypeMarketing"),
  };

  const consentTypeLabel = (type: string): string => CONSENT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");

  // Where a row was recorded; an unknown source shows as stored.
  const SOURCE_LABELS: Record<string, string> = {
    registration: t("consentSourceRegistration"),
    "registration:google": t("consentSourceRegistrationGoogle"),
    "registration:email_code": t("consentSourceRegistrationEmailCode"),
    "registration:linkedin": t("consentSourceRegistrationLinkedIn"),
    "registration:apple": t("consentSourceRegistrationApple"),
    first_sign_in: t("consentSourceFirstSignIn"),
    terms_update: t("consentSourceTermsUpdate"),
    cookie_banner: t("consentSourceCookieBanner"),
    // Written by POST /api/consent/receipt: the banner's own buttons, and the Cookie settings dialog.
    banner: t("consentSourceCookieBanner"),
    settings: t("consentSourceCookieSettings"),
    privacy_settings: t("consentSourcePrivacySettings"),
    profile: t("consentSourceProfile"),
  };

  /** A stored source in words; "Not recorded" when there is none. */
  const sourceLabel = (source: string | null | undefined): string =>
    source ? SOURCE_LABELS[source] ?? source : t("cookieChoiceNotRecorded");

  const OUTCOME_LABELS: Record<CookieChoiceOutcome, string> = {
    accepted: t("cookieOutcomeAcceptedAll"),
    rejected: t("cookieOutcomeRejectedAll"),
    custom: t("cookieOutcomeCustom"),
  };

  const outcomeLabel = (outcome: CookieChoiceOutcome): string => OUTCOME_LABELS[outcome];

  /** A category's state: On, Off, or Not recorded when the choice has no row for it. */
  const onOffLabel = (value: boolean | null): string =>
    value === null ? t("cookieChoiceNotRecorded") : value ? t("cookieChoiceOn") : t("cookieChoiceOff");

  return { typeLabel, responseTime, consentTypeLabel, sourceLabel, outcomeLabel, onOffLabel };
}
