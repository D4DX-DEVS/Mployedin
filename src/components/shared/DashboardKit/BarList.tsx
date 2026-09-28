import Link from "next/link";
import { BLUE_RAMP } from "./palette";

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  /** Pre-formatted value text; defaults to the number. */
  valueLabel?: string;
  /** Secondary text at the end, e.g. "34%". */
  note?: string;
  href?: string;
  color?: string;
}

interface BarListProps {
  rows: readonly BarListRow[];
  /** Denominator for bar widths; defaults to the largest value. */
  max?: number;
  emptyLabel?: string;
  /** "ramp" shades bars darker down the list (ordered stages); "flat" uses one colour. */
  tone?: "ramp" | "flat";
}

/** Horizontal bars with the label and value in text — the readable form for a handful of categories. */
export function BarList({ rows, max, emptyLabel, tone = "flat" }: BarListProps) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 && emptyLabel) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((row, index) => {
        const width = Math.max(row.value > 0 ? 2 : 0, Math.round((row.value / top) * 100));
        const color = row.color ?? (tone === "ramp" ? BLUE_RAMP[Math.min(index, BLUE_RAMP.length - 1)] : "#0242CE");
        const inner = (
          <>
            <span className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-foreground">{row.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="font-semibold tabular-nums text-foreground">{row.valueLabel ?? row.value}</span>
                {row.note && <span className="tabular-nums text-muted-foreground">{row.note}</span>}
              </span>
            </span>
            <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
            </span>
          </>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="block rounded-md transition-opacity hover:opacity-80">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
