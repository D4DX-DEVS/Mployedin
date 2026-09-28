import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { periodChange } from "@/lib/admin/dashboard/period";

/*
 * The pieces every admin report tab is built from, so Platform, Targets and
 * Subscriptions read as one set: a card surface, its header, the "open the
 * list" link at its foot, an empty box, and the period-change badge.
 */

export interface PeriodPair {
  current: number;
  previous: number;
}

export const reportCardClassName = "workspace-panel-surface flex flex-col rounded-3xl panel-body";

/** The link pinned to a card's foot ("Open …", "View all …"). */
export const reportLinkClassName = "mt-auto inline-flex min-h-9 items-center gap-1.5 self-start pt-3 text-xs font-semibold text-primary transition-colors hover:text-primary/80";

export function ReportCardHeader({ title, description, icon: Icon, tone, action }: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  /** A control that belongs to the whole card, e.g. a metric switch. */
  action?: ReactNode;
}) {
  return (
    <>
      {/* Chip beside the short title, description below: a global admin rule
          force-wraps bare flex rows on phones, so a chip next to a long
          description dropped to its own line. */}
      <div className="flex items-start justify-between gap-4">
        <h2 className="heading-section font-semibold tracking-tight text-foreground">{title}</h2>
        <div className={`${tone} shrink-0 rounded-2xl p-2.5`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </>
  );
}

export function ReportEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * This period against the one before, in the form that reads honestly: a
 * percentage only against a baseline of 10 or more ("+42", not "+4200%"), and
 * "New" when the previous period had none. Same rule as the dashboard snapshot.
 * `goodDirection="down"` is for counts where less is better (cancellations).
 */
export function ChangeBadge({ pair, formatValue, labels, goodDirection = "up" }: {
  pair: PeriodPair;
  formatValue: (value: number) => string;
  labels: { new: string; none: string };
  goodDirection?: "up" | "down";
}) {
  const change = periodChange(pair.current, pair.previous);
  const signed = change.kind === "count" || change.kind === "percent" ? change.value : 0;
  const direction = change.kind === "new" || signed > 0 ? "up" : signed < 0 ? "down" : "flat";
  const text = change.kind === "new"
    ? labels.new
    : change.kind === "none" || signed === 0
      ? labels.none
      : change.kind === "percent"
        ? `${signed > 0 ? "+" : "−"}${Math.abs(signed)}%`
        : `${signed > 0 ? "+" : "−"}${formatValue(Math.abs(signed))}`;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const good = direction !== "flat" && direction === goodDirection;
  const className = direction === "flat"
    ? "border-border bg-secondary/80 text-muted-foreground"
    : good
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}
