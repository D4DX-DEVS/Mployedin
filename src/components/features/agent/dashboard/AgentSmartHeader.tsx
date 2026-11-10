import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, BriefcaseBusiness, ChevronRight, Goal, Target, Wallet } from "lucide-react";
import { WorkspaceHeader, type WorkspaceMetric } from "@/components/shared/WorkspaceHeader";
import type { AgentActionCounts } from "@/lib/agents/workQueue";
import type { AssignedRegion } from "@/lib/agents/assignedRegion";
import { AssignedRegionBadge } from "@/components/shared/AssignedRegionBadge";
import type { SuperAgentContact } from "@/lib/agents/superAgentContact";
import { SuperAgentBadge } from "./SuperAgentBadge";

interface AgentSmartHeaderProps {
  /** "Good morning, Sam" — resolved by the page from the agent's own clock. */
  greeting: string;
  counts: AgentActionCounts;
  activeJobs: number;
  /** The region(s) an admin assigned, shown as a pill leading the context line. */
  regions: readonly AssignedRegion[];
  /** The super agent the agent reports to; no pill when there is none. */
  superAgent?: SuperAgentContact | null;
  /** The at-a-glance figures, on the header's own metric strip. */
  metrics: readonly WorkspaceMetric[];
  locale: string;
}

/**
 * The agent home header, on the same `WorkspaceHeader` the employer home uses:
 * greeting, one context line, the two things an agent creates, and links to
 * the profit target and commissions — links only: the client asked for no
 * target or money figures on the home (2026-10-23).
 *
 * The context line names the single most urgent thing in the queue — the
 * sentence form of the employer's "N new applications are ready for review" —
 * not the queue total, which the panel beneath already prints as its heading.
 *
 * The at-a-glance figures ride the header's metric strip (Pattern A) rather
 * than a section of their own: the home had five stacked panels and needed
 * two screens to reach the roles list.
 */
export function AgentSmartHeader({ greeting, counts, activeJobs, regions, superAgent = null, metrics, locale }: AgentSmartHeaderProps) {
  const t = useTranslations("agentDashboard.smartHeader");
  const tOverview = useTranslations("agentDashboard.overview");

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

  // Phones: the line above becomes a tappable banner that opens the list it
  // counts, tinted by urgency (red for overdue work, amber for waiting
  // replies, blue for new things). Desktop keeps the sentence in the context line.
  const SUBTITLE_TARGET: Record<string, { path: string; tone: string } | undefined> = {
    subtitleFollowUps: { path: "leads", tone: "border-red-500/30 bg-red-500/10 text-red-700" },
    subtitleTasks: { path: "tasks", tone: "border-red-500/30 bg-red-500/10 text-red-700" },
    subtitleOutcomes: { path: "interviews", tone: "border-amber-500/30 bg-amber-500/10 text-amber-800" },
    subtitleOffers: { path: "offers", tone: "border-amber-500/30 bg-amber-500/10 text-amber-800" },
    subtitleCandidates: { path: "candidates", tone: "border-sky-500/30 bg-sky-500/10 text-sky-800" },
    subtitleActive: { path: "jobs", tone: "border-sky-500/30 bg-sky-500/10 text-sky-800" },
  };
  // The phone banner repeated the first chip of "Needs your attention" two
  // screens-heights apart ("8 tasks are overdue" + "8 Overdue tasks"), so it
  // is dropped while that panel has anything to show; it stays for the
  // non-queue fallbacks (active jobs).
  const queueShowsIt = subtitleKey !== "subtitleActive" && subtitleKey !== "subtitleEmpty";
  const banner = queueShowsIt ? undefined : SUBTITLE_TARGET[subtitleKey];
  const subtitle = t(subtitleKey, { count: subtitleCount });

  const buttonClass =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-border bg-background/80 px-3 text-sm font-semibold text-foreground transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-4";

  return (
    <WorkspaceHeader
      // Phones: the context line wraps (region + super agent + the queue line
      // were clamped to one line, which hid the super agent behind "…").
      className="agent-smart-header"
      title={greeting}
      context={
        <>
          {/* Region and super agent share one line; each truncates rather than
              pushing the other onto a line of its own. */}
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 [&>*]:min-w-0 [&>*]:shrink [&>*]:!me-0">
            <AssignedRegionBadge regions={regions} />
            <SuperAgentBadge contact={superAgent} locale={locale} />
          </span>
          <span className={SUBTITLE_TARGET[subtitleKey] ? "max-sm:hidden" : undefined}>{subtitle}</span>
        </>
      }
      metrics={metrics}
      actions={
        <>
          {banner && (
            <Link
              href={`/${locale}/agent/${banner.path}`}
              className={`col-span-2 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold sm:hidden ${banner.tone}`}
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{subtitle}</span>
              <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            </Link>
          )}
          <Link href={`/${locale}/agent/jobs/new`} aria-label={t("postJob")} className={`${buttonClass} max-sm:border-sky-500/30 max-sm:bg-sky-500/10 max-sm:text-sky-800`}>
            <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
            <span>{t("postJob")}</span>
          </Link>
          <Link href={`/${locale}/agent/leads?new=1`} aria-label={t("addLead")} className={buttonClass}>
            <Target className="h-4 w-4" aria-hidden="true" />
            <span>{t("addLead")}</span>
          </Link>
          {/* "Target" opens the Profit target tab, not Profit report: the label
              names the target, and the report is one tab along. */}
          <Link href={`/${locale}/agent/target-management`} aria-label={tOverview("targetShort")} className={buttonClass}>
            <Goal className="h-4 w-4" aria-hidden="true" />
            <span>{tOverview("targetShort")}</span>
          </Link>
          <Link href={`/${locale}/agent/commissions`} aria-label={tOverview("commissionShort")} className={buttonClass}>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            <span>{tOverview("commissionShort")}</span>
          </Link>
        </>
      }
    />
  );
}
