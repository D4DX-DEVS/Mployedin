import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock, Sparkles } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

interface SmartHeaderProps {
  userName: string;
  newApplications: number;
  scheduledInterviews: number;
  activeJobCount: number;
  /** High-match candidate count (aiMatchScore >= 80) for the AI Matches signal. */
  highMatchCount: number;
  lastActivityMinutes: number | null;
  locale: string;
}

/** Compact dashboard identity, current hiring signal, and primary action. */
export function SmartHeader({
  userName,
  newApplications,
  scheduledInterviews,
  activeJobCount,
  highMatchCount,
  lastActivityMinutes,
  locale,
}: SmartHeaderProps) {
  const t = useTranslations("employerDashboard.smartHeader");

  // AI matches take priority — the platform's key differentiator — then fall
  // back through review / interview / active / cold-start states. The eyebrow
  // badge and the action-oriented subtitle share the same state so the hero
  // reads coherently.
  let eyebrowKey: string;
  let subtitleKey: string;
  if (highMatchCount > 0) {
    eyebrowKey = "aiMatchesFound";
    subtitleKey = "subtitleAiMatches";
  } else if (newApplications > 0) {
    eyebrowKey = "reviewQueueActive";
    subtitleKey = "subtitleReview";
  } else if (scheduledInterviews > 0) {
    eyebrowKey = "interviewMomentum";
    subtitleKey = "subtitleInterviews";
  } else if (activeJobCount > 0) {
    eyebrowKey = "employerWorkspace";
    subtitleKey = "subtitleActive";
  } else {
    eyebrowKey = "readyToLaunch";
    subtitleKey = "subtitleEmpty";
  }

  const newJobHref = `/${locale}/employer/jobs/ai-create`;
  const activityLabel =
    lastActivityMinutes !== null
      ? t("lastActivity", { time: formatTimeAgo(lastActivityMinutes, t) })
      : t("freshWorkspace");

  return (
    <DashboardPageHeader
      icon={Sparkles}
      eyebrow={t(eyebrowKey)}
      title={`${t("welcomeBack", { userName })} 👋`}
      description={t(subtitleKey, { count: highMatchCount })}
      actions={
        <Link
          href={newJobHref}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(2,132,199,0.7)] transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Sparkles className="h-4 w-4" />
          {t("createJob")}
        </Link>
      }
      footer={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {activityLabel}
        </span>
      }
    />
  );
}

function formatTimeAgo(
  minutes: number,
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minAgo", { count: Math.round(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { count: days });
}
