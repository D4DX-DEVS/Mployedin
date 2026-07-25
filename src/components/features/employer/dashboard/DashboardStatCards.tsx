import Link from "next/link";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, CalendarDays, FileText, Sparkles } from "lucide-react";

interface DashboardStatCardsProps {
  activeJobCount: number;
  newApplications: number;
  highMatchCount: number;
  /** Interviews scheduled for today — the "Today's Interviews" KPI. */
  interviewsToday: number;
  locale: string;
}

/**
 * The four headline KPI cards shown as their own row beneath the hero, matching
 * the mockup. Labels/descriptions reuse the existing smartHeader message keys.
 */
export function DashboardStatCards({
  activeJobCount,
  newApplications,
  highMatchCount,
  interviewsToday,
  locale,
}: DashboardStatCardsProps) {
  const t = useTranslations("employerDashboard.smartHeader");

  const cards = [
    {
      labelKey: "activeRoles",
      descKey: "activeRolesDesc",
      value: activeJobCount,
      href: `/${locale}/employer/jobs`,
      Icon: BriefcaseBusiness,
      chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      labelKey: "needsReview",
      descKey: "needsReviewDesc",
      value: newApplications,
      // Deep-link straight to new (unactioned) applications
      href: `/${locale}/employer/applications?status=applied`,
      Icon: FileText,
      chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    },
    {
      labelKey: "aiMatches",
      descKey: "aiMatchesDesc",
      value: highMatchCount,
      href: `/${locale}/employer/applications?scoreMin=80`,
      Icon: Sparkles,
      chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    },
    {
      labelKey: "interviewsSet",
      descKey: "interviewsSetDesc",
      value: interviewsToday,
      href: `/${locale}/employer/interviews`,
      Icon: CalendarDays,
      chip: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    },
  ];

  return (
    // Two-up compact tiles on phones — one full-width card per stat meant four
    // screens of scrolling before any real content.
    <section className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
      {cards.map(({ labelKey, descKey, value, href, Icon, chip }) => (
        <Link
          key={labelKey}
          href={href}
          className="workspace-panel-surface group rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-sky-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:rounded-[22px] sm:p-5"
        >
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.14em]">
              {t(labelKey)}
            </span>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${chip}`}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:mt-4 sm:text-3xl">{value}</div>
          <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{t(descKey)}</p>
          <span className="mt-1.5 inline-block text-xs font-semibold text-sky-700 dark:text-sky-300 sm:mt-3">
            {t("viewAll")}
          </span>
        </Link>
      ))}
    </section>
  );
}
