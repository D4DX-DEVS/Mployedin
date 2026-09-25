import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

export type StatTone = "rose" | "amber" | "sky" | "violet" | "emerald" | "slate";

export const TONES: Record<StatTone, string> = {
  rose: "bg-rose-100 text-rose-700 ring-rose-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  sky: "bg-sky-100 text-sky-700 ring-sky-200",
  violet: "bg-violet-100 text-violet-700 ring-violet-200",
  emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  slate: "bg-slate-200 text-slate-700 ring-slate-300",
};

export interface StatRow {
  key: string;
  icon: LucideIcon;
  tone: StatTone;
  value: number;
  label: string;
  /** Right-hand context, e.g. "63%" share or "of 68". */
  meta?: string;
  /** Link only when a list filters to exactly these rows. */
  href?: string;
}

/**
 * Value-first rows: the number, what it counts, and — where a page can show
 * exactly those records — a link. Rows without an exact destination render as
 * plain rows rather than linking somewhere approximate.
 */
export function StatList({ rows }: { rows: readonly StatRow[] }) {
  // flex-1 + justify-between: in a card taller than its rows (a longer card
  // beside it), the rows spread out rather than leaving a blank band below.
  return (
    <ul className="-mx-1 flex flex-1 flex-col justify-between">
      {rows.map((row) => {
        const Icon = row.icon;
        const body = (
          <>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${TONES[row.tone]}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCount(row.value)}</span>
            <span className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground sm:text-[13px]">{row.label}</span>
            {row.meta && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{row.meta}</span>}
            {row.href ? (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
            ) : (
              <span className="w-3.5 shrink-0" aria-hidden="true" />
            )}
          </>
        );
        return (
          <li key={row.key} data-stat={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="group flex min-h-9 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-h-9 items-center gap-2 px-1 py-0.5 [flex-wrap:nowrap]">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A single number as a small tile — for a strip of four or a footer of three.
 * Links under the same rule as `StatList`.
 *
 * `max-lg:grid-cols-2`, not `grid-cols-2`: globals.css stacks every flex row
 * inside a `grid-cols-2` + `grid-cols-4` grid on phones (for tiles whose label
 * sits beside the icon). Here the label has its own line, and stacking put the
 * icon, the number and the arrow on three lines.
 */
export function MetricTiles({ rows, className = "max-lg:grid-cols-2 lg:grid-cols-4" }: { rows: readonly StatRow[]; className?: string }) {
  return (
    <ul className={`grid gap-2 ${className}`}>
      {rows.map((row) => {
        const Icon = row.icon;
        const body = (
          <>
            <span className="flex items-center gap-2 [flex-wrap:nowrap]">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${TONES[row.tone]}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold tabular-nums leading-none text-foreground">{formatCount(row.value)}</span>
              {row.meta && <span className="text-[11px] tabular-nums text-muted-foreground">{row.meta}</span>}
              {row.href && (
                <ArrowRight className="ms-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
              )}
            </span>
            <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground sm:text-xs">{row.label}</span>
          </>
        );
        const tile = "flex h-full flex-col rounded-lg bg-card/80 px-2.5 py-2 ring-1 ring-inset ring-border/60";
        return (
          <li key={row.key} data-stat={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className={`group ${tile} transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
              >
                {body}
              </Link>
            ) : (
              <div className={tile}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "63%" of a whole, or undefined when the whole is zero. */
export function shareOf(value: number, whole: number): string | undefined {
  return whole > 0 ? `${Math.round((value / whole) * 100)}%` : undefined;
}
