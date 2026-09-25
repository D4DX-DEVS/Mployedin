import { cn } from "@/lib/utils";

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
}

export interface FunnelRatio {
  key: string;
  label: string;
  /** Already formatted: "4.3×", "0.46", "0%", or "—" when there is no denominator. */
  value: string;
  /** The arithmetic behind it: "112 jobs / 26 employers". */
  basis: string;
}

interface RegionalFunnelProps {
  headingId: string;
  title: string;
  description: string;
  periodLabel: string;
  stages: readonly FunnelStage[];
  ratios: readonly FunnelRatio[];
}

/* One fill per stage, in stage order. Identity is also carried by the label
   beside each bar, so colour is never the only cue. */
const STAGE_FILL = ["bg-sky-600", "bg-violet-600", "bg-cyan-600", "bg-blue-600", "bg-emerald-600"];

/**
 * All-time volume per stage, plus the three ratios that actually mean
 * something. The stages count different record types (leads, employers,
 * jobs, applications, placements), so a step-over-step percentage — "jobs
 * 431% of employers" — reads as a conversion rate and is not one. The old
 * column did exactly that; the ratios below say what they divide instead.
 */
export function RegionalFunnel({ headingId, title, description, periodLabel, stages, ratios }: RegionalFunnelProps) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <section aria-labelledby={headingId} className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 sm:px-5 sm:pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="heading-label font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 hidden text-xs leading-5 text-muted-foreground sm:block">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {periodLabel}
        </span>
      </div>

      <dl className="flex-1 space-y-1 px-4 pb-3 sm:px-5">
        {stages.map((stage, index) => {
          const width = stage.value > 0 ? Math.max(3, Math.round((stage.value / max) * 100)) : 0;
          return (
            <div key={stage.key} className="flex h-9 items-center gap-3">
              <dt className="w-24 shrink-0 truncate text-xs font-medium text-muted-foreground sm:w-28 sm:text-sm">{stage.label}</dt>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-secondary/70" aria-hidden="true">
                <div className={cn("h-full rounded-e-md", STAGE_FILL[index % STAGE_FILL.length])} style={{ width: `${width}%` }} />
              </div>
              <dd className="w-12 shrink-0 text-end text-sm font-semibold tabular-nums text-foreground">{stage.value}</dd>
            </div>
          );
        })}
      </dl>

      <dl className="grid grid-cols-3 border-t border-border/60">
        {ratios.map((ratio) => (
          <div key={ratio.key} className="min-w-0 border-e border-border/60 px-3 py-2.5 last:border-e-0 sm:px-4 sm:py-3">
            <dt className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{ratio.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground sm:text-xl">{ratio.value}</dd>
            <dd className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{ratio.basis}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
