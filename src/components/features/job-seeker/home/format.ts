import type { KpiDirection } from "@/components/shared/DashboardKit";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "3h ago" / "2d ago" from the `time.*` keys of the jobSeekerHome namespace. */
export function timeAgo(iso: string, locale: string, t: Translate): string {
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const fmt = (value: number) => value.toLocaleString(numberLocale);
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return t("time.justNow");
  if (hours < 24) return t("time.hoursAgo", { value: fmt(hours) });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { value: fmt(days) });
  return t("time.weeksAgo", { value: fmt(Math.floor(days / 7)) });
}

/** Week-over-week delta as the KPI tile wants it: signed text, direction and an accessible sentence. */
export function weekDelta(delta: number | undefined, t: Translate): { text?: string; direction: KpiDirection; label: string } {
  if (delta === undefined || delta === 0) return { direction: "flat", label: t("kpi.deltaNone") };
  const direction: KpiDirection = delta > 0 ? "up" : "down";
  const value = Math.abs(delta);
  return {
    text: `${delta > 0 ? "+" : "−"}${value}`,
    direction,
    label: t(direction === "up" ? "kpi.deltaUp" : "kpi.deltaDown", { value }),
  };
}
