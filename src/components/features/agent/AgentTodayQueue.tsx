import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Gift,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AgentActionCounts, AgentQueueItem, AgentQueueKind } from "@/lib/agents/workQueue";

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
 * The work, before the numbers.
 *
 * The agent home opened on portfolio totals — active employers, active jobs,
 * total applications — and five static shortcut tiles. Not one item on it was a
 * thing to do today, while the data for exactly that (task due dates, lead
 * follow-up dates, interviews with no outcome) already existed and never
 * surfaced. This panel is that list, ranked by how late each item is, and every
 * row lands on the filtered view holding it.
 *
 * Rendered on phones as well as desktop: the old "Recommended next" card was
 * `max-sm:hidden`, so the one prioritisation element in the workspace was
 * invisible on the device agents actually use.
 *
 * Strings arrive as props rather than being looked up here, matching the other
 * shared dashboard components — and keeping this a plain synchronous component.
 */
export function AgentTodayQueue({ items, counts, locale, labels }: AgentTodayQueueProps) {
  return (
    /* Same surface, radius and heading scale as the employer home's
       "Recommended next" panel (PriorityActions), so the two homes read as
       one product. */
    <section
      aria-labelledby="agent-today-queue"
      className="workspace-panel-surface rounded-2xl panel-body"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="agent-today-queue"
            className="heading-label font-semibold tracking-tight text-foreground"
          >
            {labels.title}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{labels.description}</p>
        </div>
        <Link
          href={`/${locale}/agent/tasks`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-sm"
        >
          {labels.viewTasks}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      {/* Counts first, as one row of chips that each open the list they
          total. They were five stacked tiles (90px); the chips take one line
          on desktop and two on a phone. */}
      <ul className="mt-3 flex flex-wrap gap-2">
        {AGENT_QUEUE_COUNT_ORDER.map((key) => (
          <li key={key}>
            <Link
              href={`/${locale}${AGENT_QUEUE_COUNT_HREFS[key]}`}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-border/70 bg-background/70 py-1 pe-3 ps-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                counts[key] > 0 ? "" : "opacity-60"
              }`}
            >
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
                {counts[key]}
              </span>
              {labels.summary[key]}
            </Link>
          </li>
        ))}
      </ul>

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-border/70">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={`/${locale}${item.href}`}
                  className="group flex min-h-12 items-center gap-3 py-2 transition-colors hover:bg-secondary/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-rejected-bg text-status-rejected">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {item.subject || labels.kind[item.kind]}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {labels.reason[item.kind]}
                      {" · "}
                      {labels.lateness[`${item.kind}-${item.id}`]}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="workspace-empty-state mt-3 flex items-center gap-3 rounded-2xl p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-status-selected" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">{labels.emptyTitle}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{labels.emptyDescription}</p>
          </div>
        </div>
      )}
    </section>
  );
}
