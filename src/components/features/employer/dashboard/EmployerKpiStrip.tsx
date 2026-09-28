import { useTranslations } from "next-intl";
import { KpiTile, type KpiDirection, type KpiIcon } from "@/components/shared/DashboardKit";
import type { EmployerDailyPoint, EmployerDashboardStats, WindowedCount } from "@/lib/dashboard/employerStats";
import { formatCount } from "@/lib/ui/intlFormat";

type Translator = (key: string, values?: Record<string, string | number>) => string;

interface Props {
  stats: EmployerDashboardStats;
  locale: string;
}

/** Change of the current window against the previous one, as a delta pill plus its spoken form. */
export function windowDelta(window: WindowedCount, days: number, t: Translator): { text?: string; direction: KpiDirection; label: string } {
  const { current, previous } = window;
  if (current === 0 && previous === 0) return { direction: "flat", label: t("overview.kpi.changeNone") };
  if (previous === 0) return { direction: "up", label: t("overview.kpi.changeNew", { days }) };
  const pct = Math.round(((current - previous) / previous) * 100);
  const direction: KpiDirection = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const value = Math.abs(pct);
  return {
    text: `${direction === "down" ? "−" : "+"}${value}%`,
    direction,
    label: t("overview.kpi.changePercent", { value, direction, days }),
  };
}

/**
 * Six headline numbers with a 30-day sparkline each. The last tile shows
 * company-profile views when any were recorded, otherwise hires — a brand-new
 * employer has nothing to see in either, and hires is the one that matters
 * once the pipeline moves.
 */
export function EmployerKpiStrip({ stats, locale }: Props) {
  const t = useTranslations("employerDashboard");
  const days = stats.windowDays;
  const spark = (field: keyof Omit<EmployerDailyPoint, "day">) => stats.daily.map((d) => d[field]);
  const p = (path: string) => `/${locale}${path}`;

  const applications = windowDelta(stats.applicationsWindow, days, t);
  const highMatches = windowDelta(stats.highMatchesWindow, days, t);
  const jobs = windowDelta(stats.jobsPostedWindow, days, t);
  const offers = windowDelta(stats.offersWindow, days, t);
  const showViews = stats.viewsWindow.current > 0 || stats.viewsWindow.previous > 0;
  const last = windowDelta(showViews ? stats.viewsWindow : stats.hiresWindow, days, t);

  const tiles: { key: string; label: string; value: string; hint: string; delta?: ReturnType<typeof windowDelta>; spark: number[]; icon: KpiIcon; href: string; color?: string }[] = [
    {
      key: "activeJobs",
      label: t("overview.kpi.activeJobs"),
      value: formatCount(stats.activeJobCount),
      hint: t("overview.kpi.postedInWindow", { count: stats.jobsPostedWindow.current, days }),
      delta: jobs,
      spark: spark("jobs"),
      icon: "jobs",
      href: p("/employer/jobs?status=active"),
    },
    {
      key: "applications",
      label: t("overview.kpi.newApplications", { days }),
      value: formatCount(stats.applicationsWindow.current),
      hint: t("overview.kpi.awaitingReview", { count: stats.newApplications }),
      delta: applications,
      spark: spark("applications"),
      icon: "applications",
      href: p("/employer/applications?status=applied"),
    },
    {
      key: "highMatches",
      label: t("overview.kpi.highMatches"),
      value: formatCount(stats.highMatchCount),
      hint: t("overview.kpi.highMatchesInWindow", { count: stats.highMatchesWindow.current, days }),
      delta: highMatches,
      spark: spark("highMatches"),
      icon: "target",
      href: p("/employer/applications?scoreMin=80"),
      color: "#4a3aa7",
    },
    {
      key: "interviews",
      label: t("overview.kpi.upcomingInterviews"),
      value: formatCount(stats.upcomingInterviews),
      hint: t("overview.kpi.interviewsToday", { count: stats.interviewsToday }),
      spark: spark("interviews"),
      icon: "interviews",
      href: p("/employer/interviews"),
      color: "#eda100",
    },
    {
      key: "offers",
      label: t("overview.kpi.offersPending"),
      value: formatCount(stats.offersAwaitingResponse),
      hint: t("overview.kpi.offersInWindow", { count: stats.offersWindow.current, days }),
      delta: offers,
      spark: spark("offers"),
      icon: "agents",
      href: p("/employer/offers"),
      color: "#eb6834",
    },
    showViews
      ? {
          key: "views",
          label: t("overview.kpi.companyViews", { days }),
          value: formatCount(stats.viewsWindow.current),
          hint: t("overview.kpi.viewsHint"),
          delta: last,
          spark: spark("views"),
          icon: "views",
          href: p("/employer/analytics"),
          color: "#1baf7a",
        }
      : {
          key: "hires",
          label: t("overview.kpi.hires", { days }),
          value: formatCount(stats.hiresWindow.current),
          hint: t("overview.kpi.hiresTotal", { count: stats.placements }),
          delta: last,
          spark: spark("hires"),
          icon: "placements",
          href: p("/employer/placements"),
          color: "#1baf7a",
        },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-kpi-strip>
      {tiles.map((tile) => (
        <KpiTile
          key={tile.key}
          label={tile.label}
          value={tile.value}
          hint={tile.hint}
          delta={tile.delta?.text}
          deltaDirection={tile.delta?.direction}
          deltaLabel={tile.delta?.label}
          spark={tile.spark}
          icon={tile.icon}
          href={tile.href}
          color={tile.color}
        />
      ))}
    </div>
  );
}
