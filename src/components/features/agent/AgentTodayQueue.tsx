import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Gift,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import type { AgentActionCounts, AgentQueueItem, AgentQueueKind } from "@/lib/agents/workQueue";
import { formatCount } from "@/lib/ui/intlFormat";

type CountKey = keyof AgentActionCounts;

export interface AgentTodayQueueLabels {
  /** Section heading: "Needs your attention". */
  title: string;
  /** Already interpolated with the total, or the "nothing overdue" wording. */
  description: string;
  /** The header action, which opens the task board. */
  viewTasks: string;
  summary: Record<CountKey, string>;
  /** Fallback row title when a record has no name of its own. */
  kind: Record<AgentQueueKind, string>;
  /** Why this row is in the queue. */
  reason: Record<AgentQueueKind, string>;
  /** Already interpolated per row, keyed by `${kind}-${id}`. */
  lateness: Record<string, string>;
  emptyTitle: string;
  emptyDescription: string;
}

interface AgentTodayQueueProps {
  items: AgentQueueItem[];
  counts: AgentActionCounts;
  locale: string;
  labels: AgentTodayQueueLabels;
}

const KIND_ICON: Record<AgentQueueKind, LucideIcon> = {
  followUp: Target,
  task: ClipboardList,
  interviewOutcome: AlertCircle,
  offerResponse: Gift,
  newCandidate: Users,
};

/** Rows three or more days late read as critical; due today as upcoming. */
const LATENESS_BADGE = (daysLate: number) =>
  daysLate >= 3
    ? "bg-rose-100 text-rose-800 ring-rose-200"
    : daysLate >= 1
      ? "bg-amber-100 text-amber-900 ring-amber-200"
      : "bg-muted text-muted-foreground ring-border";

/** Which filtered list each count opens. */
export const AGENT_QUEUE_COUNT_HREFS: Record<CountKey, string> = {
  dueFollowUps: "/agent/leads?followUp=due",
  overdueTasks: "/agent/tasks?due=overdue",
  interviewsAwaitingOutcome: "/agent/interviews?outcome=pending",
  offersAwaitingResponse: "/agent/offers?status=pending",
  newCandidates: "/agent/candidates?status=applied",
};

/** Display order — most time-critical first. */
export const AGENT_QUEUE_COUNT_ORDER: readonly CountKey[] = [
  "dueFollowUps",
  "overdueTasks",
  "interviewsAwaitingOutcome",
  "offersAwaitingResponse",
  "newCandidates",
];

/**
 * The work, before the numbers: follow-ups due, overdue tasks, interviews with
 * no outcome, offers with no reply and candidates not yet reviewed, ranked by
 * how late each is. Every count chip and every row lands on the filtered
 * view holding it, so the badge and the list it opens always agree.
 *
 * Strings arrive as props rather than being looked up here, matching the other
 * shared dashboard components — and keeping this a plain synchronous component.
 */
export function AgentTodayQueue({ items, counts, locale, labels }: AgentTodayQueueProps) {
  const hasCounts = AGENT_QUEUE_COUNT_ORDER.some((key) => counts[key] > 0);
  return (
    <Panel
      id="agent-today-queue"
      icon={BellRing}
      iconClassName={hasCounts ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}
      title={labels.title}
      subtitle={labels.description}
      action={{ href: `/${locale}/agent/tasks`, label: labels.viewTasks }}
      bodyClassName="gap-3"
    >
      {/* Counts first, as one row of chips that each open the list they
          total. Only counts that need action get a chip: a row of faded "0"
          chips was noise (owner, 2026-09-24). */}
      {hasCounts && (
        <ul className="flex flex-wrap gap-1.5">
          {AGENT_QUEUE_COUNT_ORDER.filter((key) => counts[key] > 0).map((key) => (
            <li key={key}>
              <Link
                href={`/${locale}${AGENT_QUEUE_COUNT_HREFS[key]}`}
                className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-secondary py-0.5 pe-2.5 ps-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-[11px] font-semibold tabular-nums text-primary">
                  {formatCount(counts[key])}
                </span>
                {labels.summary[key]}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 ? (
        <ul className="-mx-1 max-h-[27rem] divide-y divide-border/60 overflow-y-auto px-1">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const rowKey = `${item.kind}-${item.id}`;
            return (
              <li key={rowKey}>
                <Link
                  href={`/${locale}${item.href}`}
                  data-queue-kind={item.kind}
                  className="group flex items-center gap-2.5 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${LATENESS_BADGE(item.daysLate)}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold leading-4 text-foreground">{item.subject || labels.kind[item.kind]}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {labels.reason[item.kind]}
                      {" · "}
                      {labels.lateness[rowKey]}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">{labels.emptyTitle}</span> {labels.emptyDescription}
          </span>
        </p>
      )}
    </Panel>
  );
}
