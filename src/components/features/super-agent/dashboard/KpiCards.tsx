import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "sky" | "violet" | "emerald" | "amber";
export type KpiTrend = "up" | "down" | "flat";

export interface KpiCard {
  key: string;
  label: string;
  value: number;
  /** What the number counts and over what period — "Open right now", "Completed this month". */
  context: string;
  /** The movement line under it, already translated. */
  delta: { trend: KpiTrend; text: string };
  href: string;
  icon: LucideIcon;
  tone: KpiTone;
}

const TONE: Record<KpiTone, string> = {
  sky: "bg-sky-100 text-sky-700",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
};

const TREND: Record<KpiTrend, { icon: LucideIcon; className: string }> = {
  up: { icon: ArrowUpRight, className: "text-emerald-700" },
  down: { icon: ArrowDownRight, className: "text-rose-700" },
  flat: { icon: Minus, className: "text-muted-foreground" },
};

/**
 * The four headline figures. Every card says what it counts and over which
 * period ("Open right now", "Completed this month") — a bare "0 Placements"
 * could mean today, this month or all time. The trend line is a real count
 * for the current month, never a decorative arrow. Each card opens its list.
 */
export function SuperAgentKpiCards({ cards }: { cards: readonly KpiCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const trend = TREND[card.delta.trend];
        const TrendIcon = trend.icon;
        return (
          <Link
            key={card.key}
            href={card.href}
            data-kpi-card={card.key}
            aria-label={`${card.label}: ${card.value}. ${card.context}. ${card.delta.text}`}
            className="workspace-panel-surface group flex min-w-0 items-start gap-3 rounded-2xl p-3 transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:gap-4 sm:p-4"
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11", TONE[card.tone])}>
              <Icon className="size-4 sm:size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-2xl">
                {card.value}
              </span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-foreground sm:text-sm">{card.label}</span>
              <span className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{card.context}</span>
              <span className={cn("mt-1.5 flex items-center gap-1 text-[11px] font-medium sm:text-xs", trend.className)}>
                <TrendIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{card.delta.text}</span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
