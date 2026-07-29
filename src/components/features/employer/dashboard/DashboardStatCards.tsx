import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  FileEdit,
  FileText,
  PauseCircle,
  Sparkles,
} from "lucide-react";

interface DashboardStatCardsProps {
  activeJobCount: number;
  draftJobCount: number;
  pausedJobCount: number;
  newApplications: number;
  highMatchCount: number;
  /** Interviews scheduled for today — the "Today's Interviews" KPI. */
  interviewsToday: number;
  locale: string;
}

/** Dense decision KPI strip with job-status context folded into the first tile. */
export function DashboardStatCards({
  activeJobCount,
  draftJobCount,
  pausedJobCount,
  newApplications,
  highMatchCount,
  interviewsToday,
  locale,
}: DashboardStatCardsProps) {
  const t = useTranslations("employerDashboard.smartHeader");
  const tJobs = useTranslations("employerDashboard.jobQuickFilters");

  const cards = [
    {
      labelKey: "activeRoles",
      descKey: "activeRolesDesc",
      value: activeJobCount,
      href: `/${locale}/employer/jobs`,
      Icon: BriefcaseBusiness,
      chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
      secondary: (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <FileEdit className="h-3 w-3" /> {draftJobCount} {tJobs("draftTab")}
          </span>
          <span className="inline-flex items-center gap-1">
            <PauseCircle className="h-3 w-3" /> {pausedJobCount} {tJobs("pausedTab")}
          </span>
        </span>
      ),
    },
    {
      labelKey: "needsReview",
      descKey: "needsReviewDesc",
      value: newApplications,
      // Deep-link straight to new (unactioned) applications
      href: `/${locale}/employer/applications?status=applied`,
      Icon: FileText,
      chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
      secondary: null,
    },
    {
      labelKey: "aiMatches",
      descKey: "aiMatchesDesc",
      value: highMatchCount,
      href: `/${locale}/employer/applications?scoreMin=80`,
      Icon: Sparkles,
      chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
      secondary: null,
    },
    {
      labelKey: "interviewsSet",
      descKey: "interviewsSetDesc",
      value: interviewsToday,
      href: `/${locale}/employer/interviews`,
      Icon: CalendarDays,
      chip: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
      secondary: null,
    },
  ];

  return (
    <section className="workspace-panel-surface grid overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ labelKey, descKey, value, href, Icon, chip, secondary }, index) => (
        <Link
          key={labelKey}
          href={href}
          className={`group relative min-w-0 p-3.5 transition-colors hover:bg-primary/[0.035] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:p-3 sm:p-4 ${
            index > 0 ? "border-t border-border/60 sm:border-t-0 sm:odd:border-s lg:border-s" : ""
          } ${index >= 2 ? "sm:border-t lg:border-t-0" : ""}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              {t(labelKey)}
            </span>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chip}`}>
              <Icon className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
          </div>
          {secondary ? (
            <div className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{secondary}</div>
          ) : (
            <p className="mt-1.5 truncate text-[11px] leading-4 text-muted-foreground">{t(descKey)}</p>
          )}
        </Link>
      ))}
    </section>
  );
}
