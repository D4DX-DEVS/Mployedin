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
      href: `/${locale}/employer/applications`,
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
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ labelKey, descKey, value, href, Icon, chip }) => (
        <Link
          key={labelKey}
          href={href}
          className="workspace-panel-surface group rounded-[22px] p-5 transition-all hover:-translate-y-0.5 hover:border-sky-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(labelKey)}
            </span>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${chip}`}>
              <Icon className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(descKey)}</p>
          <span className="mt-3 inline-block text-xs font-semibold text-sky-700 dark:text-sky-300">
            {t("viewAll")}
          </span>
        </Link>
      ))}
    </section>
  );
}
