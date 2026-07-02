import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarChart3, CalendarDays, Clock, Sparkles, Star, UserRoundCheck } from "lucide-react";

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

/**
 * Dashboard hero — mirrors the "AI Hiring Summary" mockup: an eyebrow pill that
 * reflects the most pressing workspace signal, a welcome line, three inline
 * summary stats sourced from live data, a friendly robot mascot, and the single
 * "Create Job with AI" CTA. The four KPI tiles now live in DashboardStatCards.
 */
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
  // back through review / interview / active / cold-start states.
  let eyebrowKey: string;
  if (highMatchCount > 0) eyebrowKey = "aiMatchesFound";
  else if (newApplications > 0) eyebrowKey = "reviewQueueActive";
  else if (scheduledInterviews > 0) eyebrowKey = "interviewMomentum";
  else if (activeJobCount > 0) eyebrowKey = "employerWorkspace";
  else eyebrowKey = "readyToLaunch";

  const newJobHref = `/${locale}/employer/jobs/ai-create`;
  const activityLabel =
    lastActivityMinutes !== null
      ? t("lastActivity", { time: formatTimeAgo(lastActivityMinutes, t) })
      : t("freshWorkspace");

  const summary = [
    { key: "summaryHighMatch", count: highMatchCount, Icon: UserRoundCheck, tone: "text-emerald-600 dark:text-emerald-400" },
    { key: "summaryReview", count: newApplications, Icon: Star, tone: "text-amber-600 dark:text-amber-400" },
    { key: "summaryInterviews", count: scheduledInterviews, Icon: CalendarDays, tone: "text-violet-600 dark:text-violet-400" },
  ];

  return (
    <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        {/* Copy + AI hiring summary */}
        <div className="min-w-0 max-w-2xl">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            {t(eyebrowKey)}
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {t("welcomeBack", { userName })} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">{t("aiHiringSummary")}</p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {summary.map(({ key, count, Icon, tone }) => (
              <span key={key} className="inline-flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Icon className={`h-4 w-4 ${tone}`} />
                {t(key, { count })}
              </span>
            ))}
          </div>

          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            {activityLabel}
          </div>
        </div>

        <RobotMascot />

        <Link
          href={newJobHref}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(2,132,199,0.7)] transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Sparkles className="h-4 w-4" />
          {t("createJob")}
        </Link>
      </div>
    </section>
  );
}

/** Decorative AI mascot with two floating capability badges. */
function RobotMascot() {
  return (
    <div className="relative mx-auto flex h-[120px] w-[150px] shrink-0 items-center justify-center" aria-hidden>
      <div className="absolute h-24 w-24 rounded-full bg-sky-400/15 blur-xl dark:bg-sky-400/10" />
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" className="relative">
        <rect x="4" y="6" width="16" height="13" rx="5" fill="#2F6FED" />
        <circle cx="9.3" cy="12.5" r="1.6" fill="white" />
        <circle cx="14.7" cy="12.5" r="1.6" fill="white" />
        <path d="M9.5 15.5a3 2 0 0 0 5 0" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="12" y1="6" x2="12" y2="3" stroke="#2F6FED" strokeWidth="1.8" />
        <circle cx="12" cy="2.2" r="1.2" fill="#EA7A1A" />
        <rect x="1" y="11" width="2.5" height="5" rx="1" fill="#9CBBF5" />
        <rect x="20.5" y="9" width="2.5" height="7" rx="1" fill="#9CBBF5" />
      </svg>
      <div className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-background shadow-md">
        <Star className="h-3.5 w-3.5 text-violet-500" />
      </div>
      <div className="absolute bottom-0 left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-background shadow-md">
        <BarChart3 className="h-3.5 w-3.5 text-sky-500" />
      </div>
    </div>
  );
}

function formatTimeAgo(minutes: number, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minAgo", { count: Math.round(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { count: days });
}
