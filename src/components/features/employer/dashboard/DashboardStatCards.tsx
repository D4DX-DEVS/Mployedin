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
    // 2×2 on phones — four stacked full-width rows ate most of the fold.
    <section className="workspace-panel-surface grid grid-cols-2 overflow-hidden rounded-2xl lg:grid-cols-4">
      {cards.map(({ labelKey, descKey, value, href, Icon, chip, secondary }, index) => (
        <Link
          key={labelKey}
          href={href}
          className={`group relative min-w-0 border-border/60 p-2.5 transition-colors hover:bg-primary/[0.035] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:p-4 ${
            index % 2 === 1 ? "border-s" : ""
          } ${index >= 2 ? "border-t lg:border-t-0" : ""} ${index > 0 ? "lg:border-s" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            {/* Titles like "PENDING APPLICATIONS" lost their tail to `truncate`
                in a 2-up 375px tile. Wrap to two lines on phones instead; the
                4-up desktop row has the width to keep them on one. */}
            <span className="min-h-8 min-w-0 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted-foreground sm:tracking-[0.13em] lg:min-h-0 lg:truncate lg:leading-normal">
              {t(labelKey)}
            </span>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${chip}`}>
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <div className="mt-1 flex items-end justify-between gap-2 sm:mt-2">
            <div className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">{value}</div>
            <ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary sm:block" />
          </div>
          {secondary ? (
            <div className="mt-1 text-[10px] leading-4 text-muted-foreground sm:mt-1.5 sm:text-[11px]">{secondary}</div>
          ) : (
            // Half-sentence truncations read as broken in a 2-up mobile tile.
            <p className="mt-1 hidden truncate text-[10px] leading-4 text-muted-foreground sm:mt-1.5 sm:block sm:text-[11px]">{t(descKey)}</p>
          )}
        </Link>
      ))}
    </section>
  );
}
