"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { AdminQueueGroup, AdminQueueId, AdminQueueLevel } from "@/lib/admin/actionQueue";

/** One pre-rendered queue row; the server resolves every string so this component only filters. */
export interface ActionQueueRow {
  id: AdminQueueId;
  group: AdminQueueGroup;
  level: AdminQueueLevel;
  href: string;
  count: string;
  title: string;
  groupLabel: string;
  levelLabel: string;
  detail: string;
}

export interface ActionQueueArea {
  group: AdminQueueGroup;
  label: string;
  count: number;
}

const GROUP_DOTS: Record<AdminQueueGroup, string> = {
  decisions: "bg-rose-500",
  finance: "bg-amber-500",
  compliance: "bg-sky-500",
  recruitment: "bg-violet-500",
};

/** Dark text on a light tint of the same hue, so every badge passes contrast. */
const LEVEL_BADGES: Record<AdminQueueLevel, string> = {
  critical: "bg-rose-100 text-rose-800 ring-rose-200",
  warning: "bg-amber-100 text-amber-900 ring-amber-200",
  upcoming: "bg-slate-100 text-slate-700 ring-slate-200",
};

/**
 * "Needs attention" is the default level, so only the exceptions — critical and
 * upcoming — print their level beside the title; every row also names it to
 * assistive tech, and the tinted count repeats it, so it is never colour alone.
 */
const LEVEL_TAGGED: ReadonlySet<AdminQueueLevel> = new Set(["critical", "upcoming"]);

interface ActionQueueListProps {
  rows: readonly ActionQueueRow[];
  areas: readonly ActionQueueArea[];
  labels: { all: string; areas: string; groupClear: string };
}

/**
 * The queue rows with a filter per area. An area with nothing waiting shows a
 * check instead of a count and is not a button — filtering to it would only
 * ever show an empty list.
 */
export function ActionQueueList({ rows, areas, labels }: ActionQueueListProps) {
  const [area, setArea] = useState<AdminQueueGroup | "all">("all");
  const visible = area === "all" ? rows : rows.filter((row) => row.group === area);
  const chip = "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium sm:min-h-8";
  const pressable = "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <>
      <div
        className="-mx-1 flex flex-wrap gap-1.5 px-1 max-sm:w-[calc(100%+0.5rem)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5"
        role="group"
        aria-label={labels.areas}
      >
        <button
          type="button"
          aria-pressed={area === "all"}
          onClick={() => setArea("all")}
          className={`${chip} ${pressable} ${area === "all" ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/70"}`}
          data-queue-filter="all"
        >
          {/* The space is not rendered in a flex row; it keeps the accessible name "All 9", not "All9". */}
          {labels.all}{" "}
          <span className="font-semibold tabular-nums">{rows.length}</span>
        </button>
        {areas.map((option) =>
          option.count === 0 ? (
            <span key={option.group} className={`${chip} bg-secondary text-muted-foreground`} data-queue-group={option.group}>
              <span className={`h-1.5 w-1.5 rounded-full ${GROUP_DOTS[option.group]}`} aria-hidden="true" />
              {option.label}
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-label={labels.groupClear} />
            </span>
          ) : (
            <button
              key={option.group}
              type="button"
              aria-pressed={area === option.group}
              // A second press on the active area returns to the whole queue.
              onClick={() => setArea((current) => (current === option.group ? "all" : option.group))}
              className={`${chip} ${pressable} ${
                area === option.group ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/70"
              }`}
              data-queue-group={option.group}
              data-queue-filter={option.group}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${GROUP_DOTS[option.group]}`} aria-hidden="true" />
              {option.label}{" "}
              <span className="font-semibold tabular-nums">{option.count}</span>
            </button>
          ),
        )}
      </div>

      <ul className="mt-3 divide-y divide-border/70 rounded-xl bg-card ring-1 ring-inset ring-border/60" aria-live="polite">
        {visible.map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="group flex min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [flex-wrap:nowrap] sm:px-4"
              data-queue-id={row.id}
              data-level={row.level}
            >
              <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 ring-1 ring-inset ${LEVEL_BADGES[row.level]}`}>
                <span className="text-xs font-semibold tabular-nums">{row.count}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2 [flex-wrap:nowrap]">
                  <span className="truncate text-sm font-semibold leading-5 text-foreground">{row.title}</span>
                  {LEVEL_TAGGED.has(row.level) && (
                    <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ring-1 ring-inset sm:inline ${LEVEL_BADGES[row.level]}`} aria-hidden="true">
                      {row.levelLabel}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  <span className="sr-only">{row.levelLabel}</span>
                  <span className="font-medium text-foreground/80">{row.groupLabel}</span> · {row.detail}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
