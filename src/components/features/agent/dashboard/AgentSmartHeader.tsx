import Link from "next/link";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, Target } from "lucide-react";
import { WorkspaceHeader, type WorkspaceMetric } from "@/components/shared/WorkspaceHeader";
import { CopilotLauncher } from "@/components/shared/CopilotLauncher";
import type { AgentActionCounts } from "@/lib/agents/workQueue";

interface AgentSmartHeaderProps {
  userName: string;
  counts: AgentActionCounts;
  activeJobs: number;
  /** The four at-a-glance figures, on the header's own metric strip. */
  metrics: readonly WorkspaceMetric[];
  locale: string;
}

/**
 * The agent home header, on the same `WorkspaceHeader` the employer home uses:
 * greeting, one context line, the two things an agent creates, Copilot.
 *
 * The context line names the single most urgent thing in the queue — the
 * sentence form of the employer's "N new applications are ready for review" —
 * not the queue total, which the panel beneath already prints as its heading.
 *
 * The at-a-glance figures ride the header's metric strip (Pattern A) rather
 * than a section of their own: the home had five stacked panels and needed
 * two screens to reach the roles list.
 */
export function AgentSmartHeader({ userName, counts, activeJobs, metrics, locale }: AgentSmartHeaderProps) {
  const t = useTranslations("agentDashboard.smartHeader");

  // Same order the queue ranks its kinds: a cooling lead outranks an unlogged
  // interview outcome, which outranks an unanswered offer.
  let subtitleKey: string;
  let subtitleCount: number;
  if (counts.dueFollowUps > 0) {
    subtitleKey = "subtitleFollowUps";
    subtitleCount = counts.dueFollowUps;
  } else if (counts.overdueTasks > 0) {
    subtitleKey = "subtitleTasks";
    subtitleCount = counts.overdueTasks;
  } else if (counts.interviewsAwaitingOutcome > 0) {
    subtitleKey = "subtitleOutcomes";
    subtitleCount = counts.interviewsAwaitingOutcome;
  } else if (counts.offersAwaitingResponse > 0) {
    subtitleKey = "subtitleOffers";
    subtitleCount = counts.offersAwaitingResponse;
  } else if (counts.newCandidates > 0) {
    subtitleKey = "subtitleCandidates";
    subtitleCount = counts.newCandidates;
  } else if (activeJobs > 0) {
    subtitleKey = "subtitleActive";
    subtitleCount = activeJobs;
  } else {
    subtitleKey = "subtitleEmpty";
    subtitleCount = 0;
  }

  const buttonClass =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-border bg-background/80 px-3 text-sm font-semibold text-foreground transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-4";

  return (
    <WorkspaceHeader
      title={`${t("welcomeBack", { userName })} \u{1F44B}`}
      context={t(subtitleKey, { count: subtitleCount })}
      metrics={metrics}
      actions={
        <>
          <Link href={`/${locale}/agent/jobs/new`} aria-label={t("postJob")} className={buttonClass}>
            <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">{t("postJobShort")}</span>
            <span className="hidden sm:inline">{t("postJob")}</span>
          </Link>
          <Link href={`/${locale}/agent/leads?new=1`} aria-label={t("addLead")} className={buttonClass}>
            <Target className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">{t("addLeadShort")}</span>
            <span className="hidden sm:inline">{t("addLead")}</span>
          </Link>
          <CopilotLauncher />
        </>
      }
    />
  );
}
