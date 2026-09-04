import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Gift,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AgentActionCounts, AgentQueueItem, AgentQueueKind } from "@/lib/agents/workQueue";

type CountKey = keyof AgentActionCounts;

export interface AgentTodayQueueLabels {
  eyebrow: string;
  /** Already interpolated with the total, or the "nothing overdue" wording. */
  title: string;
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
    <section
      aria-labelledby="agent-today-queue"
      className="workspace-panel-surface rounded-3xl panel-body"
    >
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {labels.eyebrow}
        </p>
        <h2
          id="agent-today-queue"
          className="heading-section font-semibold tracking-tight text-foreground"
        >
          {labels.title}
        </h2>
      </div>

      {/* Counts first: five cells that each open the list they total. These are
          the only numbers on this page that name something to do. */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {AGENT_QUEUE_COUNT_ORDER.map((key) => (
          <Link
            key={key}
            href={`/${locale}${AGENT_QUEUE_COUNT_HREFS[key]}`}
            className={`workspace-subtle-surface card-pad rounded-xl transition-colors hover:border-primary/25 hover:bg-card ${
              counts[key] > 0 ? "" : "opacity-60"
            }`}
          >
            <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
              {counts[key]}
            </p>
            <p className="mt-1 text-xs font-medium leading-4 text-muted-foreground">
              {labels.summary[key]}
            </p>
          </Link>
        ))}
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-border/70">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={`/${locale}${item.href}`}
                  className="group flex min-h-14 items-center gap-3 py-3 transition-colors hover:bg-secondary/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-rejected-bg text-status-rejected">
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
        <div className="workspace-empty-state mt-4 flex items-center gap-3 rounded-2xl p-5">
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
