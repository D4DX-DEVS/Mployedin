import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock, Sparkles } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { CopilotLauncher } from "@/components/shared/CopilotLauncher";

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
  // back through review / interview / active / cold-start states. The state
  // picks one action-oriented context line; the eyebrow badge that used to
  // restate it was dropped when this moved onto WorkspaceHeader, which carries
  // one context line and reads the same signal without saying it twice.
  let subtitleKey: string;
  let subtitleCount: number;
  if (newApplications > 0) {
    subtitleKey = "subtitleReview";
    subtitleCount = newApplications;
  } else if (highMatchCount > 0) {
    subtitleKey = "subtitleAiMatches";
    subtitleCount = highMatchCount;
  } else if (scheduledInterviews > 0) {
    subtitleKey = "subtitleInterviews";
    subtitleCount = scheduledInterviews;
  } else if (activeJobCount > 0) {
    subtitleKey = "subtitleActive";
    subtitleCount = activeJobCount;
  } else {
    subtitleKey = "subtitleEmpty";
    subtitleCount = 0;
  }

  const newJobHref = `/${locale}/employer/jobs/ai-create`;
  const activityLabel =
    lastActivityMinutes !== null
      ? t("lastActivity", { time: formatTimeAgo(lastActivityMinutes, t) })
      : t("freshWorkspace");

  return (
    <WorkspaceHeader
      title={`${t("welcomeBack", { userName })} \u{1F44B}`}
      context={t(subtitleKey, { count: subtitleCount })}
      /* The timestamp rides the title row (leading the actions) so it reads
         inline with the heading rather than trailing the context line. It is
         ambient, so it stays hidden below `sm` where the actions wrap under
         the title and it would only push the primary button further down. */
      actions={
        <>
          <span
            className="hidden items-center gap-1.5 self-center text-xs font-medium text-muted-foreground sm:inline-flex"
            aria-live="polite"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {activityLabel}
          </span>
          <Link
            href={newJobHref}
            aria-label={t("createJob")}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-border bg-background/80 px-3 text-sm font-semibold text-foreground transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-4"
          >
            <Sparkles className="h-4 w-4" />
            <span className="sm:hidden">{t("createJobShort")}</span>
            <span className="hidden sm:inline">{t("createJob")}</span>
          </Link>
          <CopilotLauncher />
        </>
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
