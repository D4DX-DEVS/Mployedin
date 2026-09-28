"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatValue as fmt, type ValueFormat } from "./format";
import { SERIES } from "./palette";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
  href?: string;
}

interface DonutChartProps {
  slices: readonly DonutSlice[];
  /** Pre-formatted centre number; defaults to the sum. */
  total?: string;
  totalLabel: string;
  emptyLabel: string;
  format?: ValueFormat;
}

/** Share of a whole: a thin donut with the total in the middle and a labelled list beside it. */
export function DonutChart({ slices, total, totalLabel, emptyLabel, format }: DonutChartProps) {
  const formatValue = (v: number) => fmt(v, format);
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  const data = slices.filter((s) => s.value > 0).map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length] }));
  if (sum === 0) {
    return <p className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-1 items-center gap-4">
      <div className="relative h-36 w-36 shrink-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={66} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatValue(Number(value))}
              contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums leading-none text-foreground">{total ?? formatValue(sum)}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s, i) => {
          const color = s.color ?? SERIES[i % SERIES.length];
          const share = sum ? Math.round((s.value / sum) * 100) : 0;
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{s.label}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{formatValue(s.value)}</span>
              <span className="w-9 text-end text-[11px] tabular-nums text-muted-foreground">{share}%</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2 px-1 py-0.5">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
