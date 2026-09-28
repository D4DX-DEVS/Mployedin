"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Briefcase, Building2, CalendarClock, FileText, Handshake, MessageSquare, Minus, Target, Users, Wallet, Eye } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Icons by name: server components can only hand a client component plain data. */
const ICONS = {
  users: Users,
  companies: Building2,
  jobs: Briefcase,
  applications: FileText,
  placements: BadgeCheck,
  revenue: Wallet,
  interviews: CalendarClock,
  agents: Handshake,
  messages: MessageSquare,
  target: Target,
  views: Eye,
} satisfies Record<string, LucideIcon>;

export type KpiIcon = keyof typeof ICONS;
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export type KpiDirection = "up" | "down" | "flat";

export interface KpiTileProps {
  label: string;
  /** Pre-formatted headline number. */
  value: string;
  /** Small line under the value, e.g. "59 new in 30 days". */
  hint?: string;
  /** Pre-formatted delta text, e.g. "+34%"; omitted when there is nothing to compare. */
  delta?: string;
  deltaDirection?: KpiDirection;
  /** Accessible description of the delta ("Up 34% vs previous 30 days"). */
  deltaLabel?: string;
  /** Daily values for the sparkline; hidden when fewer than two points. */
  spark?: readonly number[];
  icon?: KpiIcon;
  href?: string;
  /** Series colour for the sparkline; defaults to the brand blue. */
  color?: string;
}

const DIRECTION_TONE: Record<KpiDirection, string> = {
  up: "bg-emerald-50 text-emerald-700",
  down: "bg-rose-50 text-rose-700",
  flat: "bg-muted text-muted-foreground",
};

/**
 * A compact KPI: label, headline number, delta pill and a sparkline of the
 * period. Links to the list that the number counts.
 */
export function KpiTile({ label, value, hint, delta, deltaDirection = "flat", deltaLabel, spark, icon, href, color = "#0242CE" }: KpiTileProps) {
  const Icon = icon ? ICONS[icon] : null;
  const DeltaIcon = deltaDirection === "up" ? ArrowUpRight : deltaDirection === "down" ? ArrowDownRight : Minus;
  const points = spark && spark.length > 1 ? spark.map((v, i) => ({ i, v })) : null;
  const gradientId = `kpi-${useId().replace(/[^a-z0-9]/gi, "")}`;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
          <span className="truncate text-xs font-semibold text-muted-foreground">{label}</span>
        </span>
        {href && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="block min-w-0 truncate text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">{value}</span>
        {points && (
          <div className="h-9 w-20 shrink-0" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {hint && <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{hint}</span>}
      {delta && (
        <span
          className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ${DIRECTION_TONE[deltaDirection]}`}
          title={deltaLabel}
          aria-label={deltaLabel}
        >
          <DeltaIcon className="h-3 w-3" aria-hidden="true" />
          <span aria-hidden="true">{delta}</span>
        </span>
      )}
    </>
  );

  const className =
    "group flex h-full min-w-0 flex-col rounded-2xl border border-border/80 bg-card p-3.5 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.36)] transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
