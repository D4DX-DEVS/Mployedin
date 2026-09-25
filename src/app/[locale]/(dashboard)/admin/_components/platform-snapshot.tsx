import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Briefcase, CalendarClock, FileText, LayoutDashboard, Minus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { periodChange } from "@/lib/admin/dashboard/period";
import type { PlatformSnapshot, WindowedCount } from "@/lib/admin/dashboard/types";
import { formatCount } from "@/lib/ui/intlFormat";
import { DashboardSection } from "./dashboard-section";
import type { DashboardTranslator } from "./types";

export type SnapshotKey = keyof PlatformSnapshot;

/** `scope` says what the big number counts; `added` names what the period figure counts. */
const CARDS: Record<SnapshotKey, { icon: LucideIcon; tone: string; path: string; scope: "allTime" | "now" }> = {
  users: { icon: Users, tone: "bg-sky-100 text-sky-800", path: "/admin/users", scope: "allTime" },
  activeJobs: { icon: Briefcase, tone: "bg-emerald-100 text-emerald-800", path: "/admin/jobs?status=active", scope: "now" },
  applications: { icon: FileText, tone: "bg-violet-100 text-violet-800", path: "/admin/applications", scope: "allTime" },
  interviews: { icon: CalendarClock, tone: "bg-amber-100 text-amber-900", path: "/admin/interviews", scope: "allTime" },
  placements: { icon: BadgeCheck, tone: "bg-emerald-100 text-emerald-800", path: "/admin/placements", scope: "allTime" },
};

/**
 * Columns per breakpoint so no row is left with a hole: one row per metric on
 * phones, 2 + 2 + 1 (the last spanning) on tablets, 3 + 2 on a six-column grid
 * at `lg`, and five across from `xl`. `sm:max-lg:grid-cols-2`, not
 * `grid-cols-2`: the admin globals restyle any bare `grid-cols-2` grid that
 * also has wider columns.
 */
function layout(count: number, index: number): { grid: string; cell: string } {
  const lastOdd = count % 2 === 1 && index === count - 1 ? "sm:max-lg:col-span-2" : "";
  if (count === 5) {
    return { grid: "sm:max-lg:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5", cell: `${lastOdd} ${index < 3 ? "lg:col-span-2" : "lg:col-span-3"} xl:col-span-1` };
  }
  const wide = count >= 4 ? "lg:grid-cols-4" : count === 3 ? "lg:grid-cols-3" : count === 2 ? "lg:grid-cols-2" : "";
  return { grid: `sm:max-lg:grid-cols-2 ${wide}`, cell: lastOdd };
}

function trend(window: WindowedCount) {
  const change = periodChange(window.current, window.previous);
  const signed = change.kind === "percent" || change.kind === "count" ? change.value : 0;
  const direction = change.kind === "new" ? "up" : signed > 0 ? "up" : signed < 0 ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const tone = direction === "up" ? "text-emerald-800" : direction === "down" ? "text-rose-800" : "text-muted-foreground";
  return { change, value: Math.abs(signed), direction, Icon, tone };
}

/** Phone row suffix: "Up 12%" or "+41", only when there is a previous period to compare with. */
function ShortChange({ window, t }: { window: WindowedCount; t: DashboardTranslator }) {
  const { change, value, direction, Icon, tone } = trend(window);
  if (change.kind === "none" || change.kind === "new") return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 font-semibold ${tone}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t(change.kind === "percent" ? "snapshot.changeShort" : "snapshot.changeShortCount", { value, direction })}
    </span>
  );
}

/** "Up 12% vs previous 30 days" as a tinted pill — or "41 more than…" over a tiny baseline — with the direction as an icon and in words. */
function Change({ window, days, t }: { window: WindowedCount; days: number; t: DashboardTranslator }) {
  const { change, value, direction, Icon, tone } = trend(window);
  const text =
    change.kind === "none"
      ? t("snapshot.changeNone")
      : change.kind === "new"
        ? t("snapshot.changeNew", { days })
        : t(change.kind === "percent" ? "snapshot.changePercent" : "snapshot.changeCount", { value, direction, days });
  // Filled pill like the reference KPI cards; plain text looked flat next to the colored tiles.
  // No sparkline: only two windows (current + previous) are queried, so a series would be fabricated.
  const pill =
    change.kind === "none" || change.kind === "new"
      ? "bg-secondary text-muted-foreground"
      : direction === "up"
        ? "bg-emerald-100 text-emerald-800"
        : direction === "down"
          ? "bg-rose-100 text-rose-800"
          : "bg-secondary text-muted-foreground";
  return (
    <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ${pill}`}>
      <Icon className={`h-3 w-3 shrink-0 ${tone}`} aria-hidden="true" />
      {text}
    </span>
  );
}

interface Props {
  data: PlatformSnapshot;
  /** Cards the admin may open; the others are left out, not shown empty. */
  keys: readonly SnapshotKey[];
  days: number;
  locale: string;
  t: DashboardTranslator;
}

/**
 * Five platform totals. Each card: the number, what it counts, how many were
 * added in the selected period and how that compares with the period before.
 * These totals appear nowhere else on the dashboard.
 */
export function AdminPlatformSnapshot({ data, keys, days, locale, t }: Props) {
  return (
    <DashboardSection
      id="admin-snapshot"
      icon={LayoutDashboard}
      iconClassName="bg-sky-100 text-sky-800"
      title={t("snapshot.title")}
      description={t("snapshot.description", { days })}
      action={{ href: `/${locale}/admin/analytics`, label: t("snapshot.viewAnalytics") }}
    >
      <ul className={`grid gap-2 ${layout(keys.length, 0).grid}`}>
        {keys.map((key, index) => {
          const card = CARDS[key];
          const metric = data[key];
          const Icon = card.icon;
          return (
            <li key={key} className={layout(keys.length, index).cell} data-snapshot={key}>
              <Link
                href={`/${locale}${card.path}`}
                className="group flex h-full min-w-0 flex-col rounded-lg bg-card/80 p-2.5 ring-1 ring-inset ring-border/60 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {/* Phones: one row per metric. */}
                <span className="flex items-center gap-2.5 [flex-wrap:nowrap] sm:hidden">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${card.tone}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">{t(`snapshot.${key}`)}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground [flex-wrap:nowrap]">
                      <span className="truncate">{t(`snapshot.added.${key}`, { count: metric.added.current, days })}</span>
                      <ShortChange window={metric.added} t={t} />
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums text-foreground">{formatCount(metric.total)}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                </span>
                <span className="hidden items-center gap-2 [flex-wrap:nowrap] sm:flex">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${card.tone}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{t(`snapshot.${key}`)}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </span>
                <span className="mt-1.5 hidden flex-wrap items-baseline gap-x-2 sm:flex">
                  <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">{formatCount(metric.total)}</span>
                  <span className="text-xs text-muted-foreground">{t(`snapshot.scope.${card.scope}`)}</span>
                </span>
                <span className="mt-1 hidden text-xs text-foreground sm:block">{t(`snapshot.added.${key}`, { count: metric.added.current, days })}</span>
                <span className="hidden sm:block">
                  <Change window={metric.added} days={days} t={t} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </DashboardSection>
  );
}
