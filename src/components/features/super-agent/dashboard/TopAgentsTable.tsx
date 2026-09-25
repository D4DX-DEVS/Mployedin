import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TopAgentRow } from "@/lib/superAgent/dashboardData";

interface TopAgentsTableProps {
  headingId: string;
  title: string;
  description: string;
  viewAllLabel: string;
  viewAllHref: string;
  /** Builds the per-agent link. */
  agentHref: (agentId: string) => string;
  columns: { rank: string; agent: string; leads: string; jobs: string; applications: string; placements: string };
  rows: readonly TopAgentRow[];
  emptyTitle: string;
  emptyDescription: string;
}

const RANK_STYLE = ["bg-amber-100 text-amber-800", "bg-slate-200 text-slate-700", "bg-orange-100 text-orange-800"];

/**
 * The five most productive agents, with the four figures that make up their
 * work — counted live (getLiveAgentPerformance), never from the drifting
 * `Agent.performance` counters. Phones get one row per agent with the figures
 * on a second line instead of a squeezed five-column table.
 */
export function TopAgentsTable({
  headingId, title, description, viewAllLabel, viewAllHref, agentHref, columns, rows, emptyTitle, emptyDescription,
}: TopAgentsTableProps) {
  const figures = (row: TopAgentRow) => [
    { key: "leads", label: columns.leads, value: row.leads },
    { key: "jobs", label: columns.jobs, value: row.jobs },
    { key: "applications", label: columns.applications, value: row.applications },
    { key: "placements", label: columns.placements, value: row.placements },
  ];

  return (
    <section aria-labelledby={headingId} className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 sm:px-5 sm:pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="heading-label font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 hidden text-xs leading-5 text-muted-foreground sm:block">{description}</p>
        </div>
        <Link href={viewAllHref} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/85 sm:min-h-0">
          {viewAllLabel}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 pt-2 text-center">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      ) : (
        <div className="flex-1 px-2 pb-2 sm:px-3 sm:pb-3">
          {/* Column heads, sm and up only; phones read the labels inline. */}
          <div className="hidden grid-cols-[2rem_minmax(0,1fr)_repeat(4,4.5rem)] items-center gap-2 border-b border-border/60 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>{columns.rank}</span>
            <span>{columns.agent}</span>
            {figures(rows[0]).map((f) => <span key={f.key} className="truncate text-end">{f.label}</span>)}
          </div>
          <ol>
            {rows.map((row, index) => (
              <li key={row.agentId} className="border-b border-border/50 last:border-0">
                <Link
                  href={agentHref(row.agentId)}
                  className="grid min-h-11 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-2 transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:grid-cols-[2rem_minmax(0,1fr)_repeat(4,4.5rem)]"
                >
                  <span className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                    RANK_STYLE[index] ?? "bg-secondary text-muted-foreground",
                  )}>
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">{row.name}</span>
                  {/* Phone: the four figures as one caption line under the name. */}
                  <span className="col-start-2 truncate text-[11px] text-muted-foreground sm:hidden">
                    {figures(row).map((f) => `${f.value} ${f.label}`).join(" · ")}
                  </span>
                  {figures(row).map((f) => (
                    <span key={f.key} className="hidden text-end text-sm tabular-nums text-foreground sm:block">{f.value}</span>
                  ))}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
