"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { resolveIntlLocale } from "@/lib/ui/intlFormat";
import type { PeriodType, SchedulePeriod } from "@/lib/targets/schedule";
import { monthName } from "./profitFormat";

/** `Jan 1 – Mar 31`, in the viewer's language. The dates are UTC calendar days. */
export function formatPeriodRange(period: Pick<SchedulePeriod, "startDate" | "endDate">, locale?: string): string {
  const format = new Intl.DateTimeFormat(resolveIntlLocale(locale), { month: "short", day: "numeric", timeZone: "UTC" });
  const day = (value: string) => format.format(new Date(`${value}T00:00:00Z`));
  return period.startDate === period.endDate ? day(period.startDate) : `${day(period.startDate)} – ${day(period.endDate)}`;
}

/**
 * What to call a period: the month, `Q2`, `W14`, the year, or a custom period's
 * own name. Names come from the profit report namespace so the editor and the
 * report agree.
 */
export function usePeriodNamer() {
  const t = useTranslations("profitReport");
  const locale = useLocale();
  return useCallback(
    (period: Pick<SchedulePeriod, "startDate" | "label">, type: PeriodType, index: number, year: number): string => {
      switch (type) {
        case "monthly":
          return monthName(Number(period.startDate.slice(5, 7)), locale);
        case "quarterly":
          return t("quarterName", { number: index + 1 });
        case "weekly":
          return t("weekName", { number: index + 1 });
        case "annual":
          return String(year);
        default:
          return period.label || t("customPeriodName", { number: index + 1 });
      }
    },
    [t, locale],
  );
}
