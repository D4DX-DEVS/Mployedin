import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SECTION_PANEL } from "./dashboard-section";

interface SectionSkeletonProps {
  /** Announced while the section loads, e.g. "Loading recruitment". */
  label: string;
  cards?: number;
  rows?: number;
  /** Grid columns of the placeholder cards; mirror the real section so nothing jumps. */
  className?: string;
}

/** Legacy generic placeholder; kept for compatibility. Prefer the per-section skeletons below. */
export function SectionSkeleton({ label, cards = 3, rows = 4, className = "md:grid-cols-2 xl:grid-cols-3" }: SectionSkeletonProps) {
  return (
    <section aria-busy="true" aria-label={label} className={SECTION_PANEL} data-surface="light-panel">
      <SectionHead />
      <div className={`mt-2.5 grid gap-2.5 sm:mt-3 ${className}`}>
        {Array.from({ length: cards }, (_, card) => (
          <div key={card} className="workspace-subtle-surface rounded-xl p-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
            <Skeleton className="h-4 w-28" />
            <div className="mt-2.5 space-y-2">
              {Array.from({ length: rows }, (_, row) => (
                <Skeleton key={row} className="h-5 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Primitives: each mirrors the real component's shape and spacing ──────── */

function SectionShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-busy="true" aria-label={label} className={SECTION_PANEL} data-surface="light-panel">
      <SectionHead />
      {children}
    </section>
  );
}

/** Badge, title, description and the "view all" link slot of DashboardSection. */
function SectionHead() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <div className="flex min-w-0 items-center gap-2.5 [flex-wrap:nowrap]">
        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="hidden h-3 w-72 max-w-full sm:block" />
        </div>
      </div>
      <Skeleton className="h-4 w-24 shrink-0 max-sm:hidden" />
    </div>
  );
}

/** Title, subtitle and action-link slot of DashboardCard. */
function CardShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`workspace-subtle-surface flex h-full min-w-0 flex-col rounded-xl p-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardHead() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32 max-w-full" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

/** Icon tile + number + label line of StatList rows (job health, employers, agents). */
function StatRow() {
  return (
    <div className="flex min-h-9 items-center gap-2 px-1 py-0.5">
      <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
      <Skeleton className="h-4 w-11 shrink-0" />
      <Skeleton className="h-3 min-w-0 flex-1" />
    </div>
  );
}

/** Label + track bar + count of pipeline / users-by-role / plan rows. */
function BarRow() {
  return (
    <div className="grid min-h-8 grid-cols-[8rem_1fr_auto] items-center gap-3 px-1">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/* ── Needs your action: group pills, then icon tiles ──────────────────────── */

export function QueueSkeleton({ label }: { label: string }) {
  return (
    <SectionShell label={label}>
      <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3">
        {Array.from({ length: 4 }, (_, pill) => (
          <Skeleton key={pill} className="h-6 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-3 grid gap-1.5 sm:gap-2 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, tile) => (
          <div
            key={tile}
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-1.5 ring-1 ring-inset ring-border/70 sm:min-h-14"
          >
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg sm:h-8 sm:w-8" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="hidden h-3 w-full sm:block" />
            </div>
            <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ── Platform snapshot: 5 KPI cards with number + delta pill ──────────────── */

const SNAPSHOT_CELLS = [
  "lg:col-span-2 xl:col-span-1",
  "lg:col-span-2 xl:col-span-1",
  "lg:col-span-2 xl:col-span-1",
  "lg:col-span-3 xl:col-span-1",
  "sm:max-lg:col-span-2 lg:col-span-3 xl:col-span-1",
];

export function SnapshotSkeleton({ label }: { label: string }) {
  return (
    <SectionShell label={label}>
      <div className="mt-2.5 grid gap-2 sm:mt-3 sm:max-lg:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5">
        {SNAPSHOT_CELLS.map((cell, card) => (
          <div key={card} className={cell}>
            <div className="flex h-full min-w-0 flex-col rounded-lg bg-card/80 p-2.5 ring-1 ring-inset ring-border/60">
              <div className="flex items-center gap-2 [flex-wrap:nowrap]">
                <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                <Skeleton className="h-3 min-w-0 flex-1" />
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="mt-1 hidden h-3 w-32 max-w-full sm:block" />
              <Skeleton className="mt-1.5 hidden h-5 w-36 max-w-full rounded-full sm:block" />
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ── Recruitment: pipeline bars, stat rows, funnel blocks ─────────────────── */

function FunnelBlock() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 [flex-wrap:nowrap]">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-12 shrink-0" />
      </div>
      <Skeleton className="mt-1 h-2 w-full rounded-full" />
      <Skeleton className="mt-1 h-3 w-40 max-w-full" />
    </div>
  );
}

export function RecruitmentSkeleton({ label }: { label: string }) {
  return (
    <SectionShell label={label}>
      <div className="mt-2.5 grid items-stretch gap-2.5 sm:mt-3 md:grid-cols-2 xl:grid-cols-3">
        <CardShell>
          <CardHead />
          <div className="mt-2 flex flex-1 flex-col justify-between">
            {Array.from({ length: 8 }, (_, row) => (
              <BarRow key={row} />
            ))}
          </div>
        </CardShell>
        <CardShell>
          <CardHead />
          <div className="mt-2 flex flex-1 flex-col justify-between">
            {Array.from({ length: 5 }, (_, row) => (
              <StatRow key={row} />
            ))}
          </div>
        </CardShell>
        <CardShell className="md:col-span-2 xl:col-span-1">
          <CardHead />
          <div className="mt-2 flex flex-1 flex-col gap-2">
            <FunnelBlock />
            <FunnelBlock />
            <FunnelBlock />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        </CardShell>
      </div>
    </SectionShell>
  );
}

/* ── People & network: role bars, employer stats, agent stats + target bar ── */

export function PeopleSkeleton({ label }: { label: string }) {
  return (
    <SectionShell label={label}>
      <div className="mt-2.5 grid items-stretch gap-2.5 sm:mt-3 md:grid-cols-2 xl:grid-cols-3">
        <CardShell>
          <CardHead />
          <div className="mt-2 flex flex-1 flex-col justify-around">
            {Array.from({ length: 5 }, (_, row) => (
              <BarRow key={row} />
            ))}
          </div>
        </CardShell>
        <CardShell>
          <CardHead />
          <div className="mt-2 flex flex-1 flex-col justify-between">
            {Array.from({ length: 4 }, (_, row) => (
              <StatRow key={row} />
            ))}
          </div>
        </CardShell>
        <CardShell className="md:col-span-2 xl:col-span-1">
          <CardHead />
          <div className="mt-2 flex flex-col justify-between">
            {Array.from({ length: 4 }, (_, row) => (
              <StatRow key={row} />
            ))}
          </div>
          <div className="mt-auto space-y-1.5 border-t border-border/60 pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </CardShell>
      </div>
    </SectionShell>
  );
}

/* ── Finance: money table + status pills, plans, payments ─────────────────── */

function MoneyTable() {
  return (
    <div className="rounded-lg bg-card/80 ring-1 ring-inset ring-border/60">
      <div className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-2 border-b border-border/60 px-2.5 py-1.5">
        {Array.from({ length: 4 }, (_, col) => (
          <Skeleton key={col} className="h-3 w-full last:justify-self-end" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, row) => (
        <div key={row} className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-2 border-b border-border/50 px-2.5 py-1.5 last:border-b-0">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-16 justify-self-end" />
          <Skeleton className="h-4 w-16 justify-self-end" />
          <Skeleton className="h-4 w-16 justify-self-end" />
        </div>
      ))}
    </div>
  );
}

export function FinanceSkeleton({ label }: { label: string }) {
  return (
    <SectionShell label={label}>
      <div className="mt-2.5 grid items-stretch gap-2.5 sm:mt-3 md:grid-cols-2">
        <CardShell className="md:col-span-2">
          <CardHead />
          <div className="mt-2 grid gap-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-4">
            <MoneyTable />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
              {Array.from({ length: 3 }, (_, pill) => (
                <Skeleton key={pill} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </CardShell>
        <CardShell>
          <CardHead />
          <div className="mt-2 flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 3 }, (_, row) => (
              <BarRow key={row} />
            ))}
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 3 }, (_, row) => (
              <BarRow key={row} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </CardShell>
        <CardShell>
          <CardHead />
          <div className="mt-2 flex-1 rounded-lg bg-card/80 ring-1 ring-inset ring-border/60">
            {Array.from({ length: 5 }, (_, row) => (
              <div key={row} className="flex items-center justify-between gap-2 border-b border-border/50 px-2.5 py-1.5 last:border-b-0">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </CardShell>
      </div>
    </SectionShell>
  );
}

/* ── System health: 4 status tiles ────────────────────────────────────────── */

export function HealthSkeleton({ label }: { label: string }) {
  return (
    <SectionShell label={label}>
      <div className="mt-2.5 grid gap-2 sm:mt-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, tile) => (
          <div key={tile} className="flex min-h-16 items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 ring-1 ring-inset ring-border/70">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2 [flex-wrap:nowrap]">
                <Skeleton className="h-4 min-w-0 flex-1" />
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ── Recent activity: filter pills + 2-column feed rows ───────────────────── */

export function RecentSkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true" aria-label={label} className={SECTION_PANEL} data-surface="light-panel">
      <SectionHead />
      <div className="mt-2.5 flex gap-1.5 overflow-hidden sm:mt-3">
        {Array.from({ length: 6 }, (_, pill) => (
          <Skeleton key={pill} className="h-9 w-20 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="workspace-subtle-surface mt-2 grid overflow-hidden rounded-xl lg:grid-cols-2">
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex min-h-11 items-center gap-2.5 border-b border-border/50 px-3 py-1.5 sm:px-4 lg:odd:border-e">
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}
