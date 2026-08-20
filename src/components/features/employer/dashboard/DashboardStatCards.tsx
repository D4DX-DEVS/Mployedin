import { useTranslations } from "next-intl";
import {
  BriefcaseBusiness,
  CalendarDays,
  FileEdit,
  FileText,
  PauseCircle,
  Sparkles,
} from "lucide-react";
import { DashboardSignalStrip } from "@/components/shared/DashboardOverview";

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
      iconClassName: "text-emerald-600 dark:text-emerald-300",
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
      iconClassName: "text-amber-600 dark:text-amber-300",
      secondary: null,
    },
    {
      labelKey: "aiMatches",
      descKey: "aiMatchesDesc",
      value: highMatchCount,
      href: `/${locale}/employer/applications?scoreMin=80`,
      Icon: Sparkles,
      iconClassName: "text-violet-600 dark:text-violet-300",
      secondary: null,
    },
    {
      labelKey: "interviewsSet",
      descKey: "interviewsSetDesc",
      value: interviewsToday,
      href: `/${locale}/employer/interviews`,
      Icon: CalendarDays,
      iconClassName: "text-sky-600 dark:text-sky-300",
      secondary: null,
    },
  ];

  return (
    <DashboardSignalStrip
      headingId="employer-dashboard-overview"
      title={t("overview")}
      signals={cards.map(({ labelKey, descKey, value, href, Icon, iconClassName, secondary }) => ({
        label: t(labelKey),
        value,
        href,
        icon: Icon,
        iconClassName,
        supporting: secondary ?? t(descKey),
        ariaLabel: `${t(labelKey)}: ${value}`,
      }))}
    />
  );
}
