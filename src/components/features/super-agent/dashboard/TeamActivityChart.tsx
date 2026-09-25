"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Leads, jobs posted and applications per month across the super-agent's
 * agents — the trend the rest of the page (all snapshots) cannot show.
 *
 * Palette validated with the dataviz skill's validate_palette.js against the
 * white card surface, all-pairs: blue / orange / teal pass lightness, chroma,
 * CVD (worst ΔE 13.8 protan), normal-vision (22.6) and 3:1 contrast. The
 * reference's blue + violet pair failed CVD outright (ΔE 0.4 deutan).
 */
const SERIES = [
  { key: "leads", color: "#2563eb" },
  { key: "jobs", color: "#ea580c" },
  { key: "applications", color: "#0d9488" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

export interface TeamActivityPoint {
  /** Short month label, already localised ("Apr"). */
  label: string;
  leads: number;
  jobs: number;
  applications: number;
}

interface TeamActivityChartProps {
  headingId: string;
  title: string;
  description: string;
  /** Translated series names — used for legend, tooltip and table, never as dataKeys. */
  seriesLabels: Record<SeriesKey, string>;
  monthHeader: string;
  points: readonly TeamActivityPoint[];
  emptyTitle: string;
  emptyDescription: string;
}

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string | number; value?: number }[];
  seriesLabels: Record<SeriesKey, string>;
}

function ActivityTooltip({ active, label, payload, seriesLabels }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {SERIES.map((s) => {
        const row = payload.find((p) => p.dataKey === s.key);
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="flex-1">{seriesLabels[s.key]}</span>
            <span className="font-semibold tabular-nums text-foreground">{row?.value ?? 0}</span>
          </p>
        );
      })}
    </div>
  );
}

export function TeamActivityChart({
  headingId, title, description, seriesLabels, monthHeader, points, emptyTitle, emptyDescription,
}: TeamActivityChartProps) {
  // Stable keys only: recharts reads a dot in a dataKey as a deep path, so a
  // translated label there silently empties the chart.
  const data = points.map((p) => ({ label: p.label, leads: p.leads, jobs: p.jobs, applications: p.applications }));
  const hasData = data.some((d) => d.leads > 0 || d.jobs > 0 || d.applications > 0);

  return (
    <section aria-labelledby={headingId} className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pb-1 pt-3 sm:px-5 sm:pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="heading-label font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {hasData && (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-hidden="true">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                {seriesLabels[s.key]}
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasData ? (
        <>
          <div className="flex-1 px-2 pb-3 sm:px-3" aria-hidden="true">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }}
                  content={<ActivityTooltip seriesLabels={seriesLabels} />}
                />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={seriesLabels[s.key]} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* The table view: the same figures for screen readers. Opted out of
              ResponsiveTables: its phone card-table CSS overrode sr-only and
              left a 440px table 16px off-screen, widening the whole page. */}
          <table className="sr-only" data-mobile-table="scroll">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{monthHeader}</th>
                {SERIES.map((s) => <th key={s.key} scope="col">{seriesLabels[s.key]}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>{d.leads}</td>
                  <td>{d.jobs}</td>
                  <td>{d.applications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      )}
    </section>
  );
}
