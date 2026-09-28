import { KpiTile, type KpiDirection, type KpiIcon } from "@/components/shared/DashboardKit";
import { periodChange } from "@/lib/admin/dashboard/period";
import type { DailyTrend } from "@/lib/admin/dashboard/trends.server";
import type { PlatformSnapshot, WindowedCount } from "@/lib/admin/dashboard/types";
import { formatCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

export type KpiKey = "users" | "companies" | "activeJobs" | "applications" | "placements" | "revenue";

const ICONS: Record<KpiKey, KpiIcon> = {
  users: "users",
  companies: "companies",
  activeJobs: "jobs",
  applications: "applications",
  placements: "placements",
  revenue: "revenue",
};

const PATHS: Record<KpiKey, string> = {
  users: "/admin/users",
  companies: "/admin/employers",
  activeJobs: "/admin/jobs?status=active",
  applications: "/admin/applications",
  placements: "/admin/placements",
  revenue: "/admin/invoices?status=paid",
};

export interface KpiStripData {
  snapshot: PlatformSnapshot;
  daily: readonly DailyTrend[];
  /** Live companies and how many were added; null when the admin cannot read employers. */
  companies: { total: number; added: WindowedCount } | null;
  /** Money collected in the period, in the busiest currency; null without invoice access. */
  revenue: { currency: string; current: number; previous: number } | null;
}

function delta(window: WindowedCount, days: number, t: DashboardTranslator) {
  const change = periodChange(window.current, window.previous);
  const signed = change.kind === "percent" || change.kind === "count" ? change.value : 0;
  const direction: KpiDirection = change.kind === "new" ? "up" : signed > 0 ? "up" : signed < 0 ? "down" : "flat";
  const value = Math.abs(signed);
  const label =
    change.kind === "none"
      ? t("snapshot.changeNone")
      : change.kind === "new"
        ? t("snapshot.changeNew", { days })
        : t(change.kind === "percent" ? "snapshot.changePercent" : "snapshot.changeCount", { value, direction, days });
  const text =
    change.kind === "none" || change.kind === "new"
      ? undefined
      : `${direction === "down" ? "−" : "+"}${value}${change.kind === "percent" ? "%" : ""}`;
  return { direction, text, label };
}

interface Props {
  data: KpiStripData;
  keys: readonly KpiKey[];
  days: number;
  locale: string;
  t: DashboardTranslator;
}

/** Six headline numbers with a sparkline of the period each. */
export function KpiStrip({ data, keys, days, locale, t }: Props) {
  const spark = (field: keyof DailyTrend) => data.daily.map((d) => Number(d[field]));

  const tiles = keys.map((key) => {
    const icon = ICONS[key];
    const href = `/${locale}${PATHS[key]}`;
    if (key === "companies") {
      if (!data.companies) return null;
      const d = delta(data.companies.added, days, t);
      return (
        <KpiTile key={key} label={t("kpi.companies")} value={formatCount(data.companies.total)} hint={t("kpi.added", { count: data.companies.added.current, days })} delta={d.text} deltaDirection={d.direction} deltaLabel={d.label} icon={icon} href={href} />
      );
    }
    if (key === "revenue") {
      if (!data.revenue) return null;
      const window = { current: data.revenue.current, previous: data.revenue.previous };
      const d = delta(window, days, t);
      return (
        <KpiTile
          key={key}
          label={t("kpi.revenue", { currency: data.revenue.currency })}
          value={formatCurrency(data.revenue.current, data.revenue.currency, "code")}
          hint={t("kpi.collected", { days })}
          delta={d.text}
          deltaDirection={d.direction}
          deltaLabel={d.label}
          icon={icon}
          href={href}
          color="#1baf7a"
        />
      );
    }
    const metric = data.snapshot[key];
    const d = delta(metric.added, days, t);
    const sparkField: keyof DailyTrend = key === "activeJobs" ? "jobs" : key;
    return (
      <KpiTile
        key={key}
        label={t(`snapshot.${key}`)}
        value={formatCount(metric.total)}
        hint={t(`snapshot.added.${key}`, { count: metric.added.current, days })}
        delta={d.text}
        deltaDirection={d.direction}
        deltaLabel={d.label}
        spark={spark(sparkField)}
        icon={icon}
        href={href}
      />
    );
  });

  const visible = tiles.filter(Boolean);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-kpi-strip>
      {visible}
    </div>
  );
}
