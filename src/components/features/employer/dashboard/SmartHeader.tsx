import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, Clock, Sparkles, Star, UserRoundCheck } from "lucide-react";

interface SmartHeaderProps {
  userName: string;
  newApplications: number;
  scheduledInterviews: number;
  /** Interviews scheduled for today — drives the "scheduled today" summary chip. */
  interviewsToday: number;
  activeJobCount: number;
  /** High-match candidate count (aiMatchScore >= 80) for the AI Matches signal. */
  highMatchCount: number;
  lastActivityMinutes: number | null;
  locale: string;
}

/**
 * Dashboard hero — a clean two-zone layout: copy + AI hiring summary on the
 * left, and a friendly AI mascot with the "Create Job with AI" CTA stacked
 * underneath it on the right. Keeping the CTA out of the left column keeps
 * the hero shorter. The four KPI tiles live in DashboardStatCards.
 */
export function SmartHeader({
  userName,
  newApplications,
  scheduledInterviews,
  interviewsToday,
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

  const summary = [
    { key: "summaryHighMatch", count: highMatchCount, Icon: UserRoundCheck, tone: "text-emerald-600 dark:text-emerald-400" },
    { key: "summaryReview", count: newApplications, Icon: Star, tone: "text-amber-600 dark:text-amber-400" },
    { key: "summaryInterviews", count: interviewsToday, Icon: CalendarDays, tone: "text-violet-600 dark:text-violet-400" },
  ];

  return (
    <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Copy + AI hiring summary */}
        <div className="min-w-0 max-w-2xl">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            {t(eyebrowKey)}
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {t("welcomeBack", { userName })} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {t(subtitleKey, { count: highMatchCount })}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {summary.map(({ key, count, Icon, tone }) => (
              <span key={key} className="inline-flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Icon className={`h-4 w-4 ${tone}`} />
                {t(key, { count })}
              </span>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            {activityLabel}
          </div>
        </div>

        {/* Mascot + CTA, stacked */}
        <div className="flex shrink-0 flex-col items-center gap-3">
          <RobotMascot />
          <Link
            href={newJobHref}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(2,132,199,0.7)] transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <Sparkles className="h-4 w-4" />
            {t("createJob")}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Friendly AI mascot — floats directly inside the hero (no card/tile). The
 *  source image ships with a grey backdrop, so a radial mask feathers its edges
 *  to transparent, blending the robot into the hero surface. A soft blue glow
 *  sits behind for ambiance. */
function RobotMascot() {
  // ponytail: masks the asset's grey backdrop in CSS instead of shipping a new
  // transparent PNG — swap the asset and drop the mask if a cutout is added.
  const maskImage =
    "radial-gradient(62% 64% at 50% 46%, #000 50%, rgba(0,0,0,0.35) 68%, transparent 82%)";
  return (
    <div className="relative shrink-0" aria-hidden>
      <div className="absolute inset-0 -z-10 rounded-[36px] bg-sky-400/20 blur-2xl dark:bg-sky-400/15" />
      <div className="relative h-32 w-32 sm:h-40 sm:w-40 md:h-44 md:w-44">
        <Image
          src="/ai-assistant.png"
          alt="Mployedin AI assistant"
          fill
          sizes="176px"
          priority
          className="scale-[1.15] object-cover object-[52%_40%]"
          style={{ WebkitMaskImage: maskImage, maskImage }}
        />
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
