import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StatTone = "neutral" | "good" | "warning" | "critical" | "info";

export interface StatRow {
  key: string;
  label: string;
  value: string;
  tone?: StatTone;
  icon?: LucideIcon;
  href?: string;
}

const TONE: Record<StatTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  critical: "bg-rose-50 text-rose-700",
  info: "bg-primary/10 text-primary",
};

/** Label + number rows, each optionally a link — for lists of a handful of counts. */
export function StatRows({ rows }: { rows: readonly StatRow[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => {
        const Icon = row.icon;
        const inner = (
          <>
            {Icon && (
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TONE[row.tone ?? "neutral"]}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{row.label}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{row.value}</span>
            {row.href && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />}
          </>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="flex items-center gap-2.5 py-2 transition-colors hover:bg-muted/50">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
