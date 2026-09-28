"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactNumber, formatValue as fmt, type ValueFormat } from "./format";
import { AXIS_TICK, GRID_STROKE, SERIES } from "./palette";

export interface TrendSeries {
  /** Stable data key (no dots). */
  key: string;
  label: string;
  color?: string;
}

export interface TrendPoint {
  /** Localised short label for the x axis ("12 Sep"). */
  label: string;
  [key: string]: string | number;
}

interface TrendChartProps {
  series: readonly TrendSeries[];
  points: readonly TrendPoint[];
  height?: number;
  emptyLabel: string;
  /** How tooltip values are written; defaults to a plain count. */
  format?: ValueFormat;
}

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string | number; value?: number; color?: string }[];
  series: readonly TrendSeries[];
  format?: ValueFormat;
}

function TrendTooltip({ active, label, payload, series, format }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {series.map((s, i) => {
        const row = payload.find((p) => p.dataKey === s.key);
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? SERIES[i] }} aria-hidden="true" />
            <span className="flex-1">{s.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{fmt(Number(row?.value ?? 0), format)}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Multi-series area chart with a crosshair tooltip and legend. One y axis only. */
export function TrendChart({ series, points, height = 240, emptyLabel, format }: TrendChartProps) {
  const hasData = points.some((p) => series.some((s) => Number(p[s.key]) > 0));
  if (!hasData) {
    return <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-1 flex-col">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color ?? SERIES[i] }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points as TrendPoint[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color ?? SERIES[i]} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={s.color ?? SERIES[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} tickFormatter={compactNumber} />
            <Tooltip content={<TrendTooltip series={series} format={format} />} cursor={{ stroke: GRID_STROKE }} />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color ?? SERIES[i]}
                strokeWidth={2}
                fill={`url(#trend-${s.key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
