"use client";

import { useLocale, useTranslations } from "next-intl";

/**
 * The day codes the database stores and validates ("Mon"…, see
 * lib/validators/settings.ts). They stay English; only what is shown changes.
 */
export const WEEKDAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface WeekdayLabel {
  /** For buttons and tight rows. */
  label: string;
  /** For screen readers and anywhere there is room. */
  full: string;
}

/** Display names for the stored day codes, in the page language. */
export function useWeekdayLabels(): Record<WeekdayCode, WeekdayLabel> {
  const t = useTranslations("calendar");
  // Arabic has no everyday short day names: the calendar grid's clipped forms
  // (اثن، ثلا) read as fragments on a button, so Arabic shows the full name,
  // as the agent settings page already did.
  const useShort = useLocale() !== "ar";
  const day = (short: string, full: string): WeekdayLabel => ({ label: useShort ? short : full, full });
  return {
    Mon: day(t("weekdaysShort.mon"), t("weekdaysFull.monday")),
    Tue: day(t("weekdaysShort.tue"), t("weekdaysFull.tuesday")),
    Wed: day(t("weekdaysShort.wed"), t("weekdaysFull.wednesday")),
    Thu: day(t("weekdaysShort.thu"), t("weekdaysFull.thursday")),
    Fri: day(t("weekdaysShort.fri"), t("weekdaysFull.friday")),
    Sat: day(t("weekdaysShort.sat"), t("weekdaysFull.saturday")),
    Sun: day(t("weekdaysShort.sun"), t("weekdaysFull.sunday")),
  };
}
