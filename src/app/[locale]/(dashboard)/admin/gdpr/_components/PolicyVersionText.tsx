"use client";

import { useLocale, useTranslations } from "next-intl";
import { classifyPolicyVersion } from "@/lib/gdpr/policyVersionLabel";
import { formatListDate } from "@/lib/ui/intlFormat";

/**
 * A stored policyVersion in words: "Cookie wording v1" for a cookie row,
 * "Version of 29 Sep 2026" for a Terms / Privacy row, and anything else as
 * stored. Never "Version of —".
 */
export function PolicyVersionText({ value }: { value: string }) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const label = classifyPolicyVersion(value);

  if (label.kind === "cookie") return <>{t("consentCookieWordingVersion", { version: label.version })}</>;
  if (label.kind === "date") return <>{t("consentPolicyVersion", { date: formatListDate(label.date, locale) })}</>;
  return <>{label.value}</>;
}
