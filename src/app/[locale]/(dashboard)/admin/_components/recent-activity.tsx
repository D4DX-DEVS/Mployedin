"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Briefcase, CalendarClock, CreditCard, FileText, History, ReceiptText, Settings2, UserPlus, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RecentEventCategory, RecentEventKind } from "@/lib/admin/dashboard/types";
import { SECTION_PANEL } from "./dashboard-section";

/** One pre-rendered line; the server resolves every string so this component only filters. */
export interface RecentActivityRow {
  id: string;
  kind: RecentEventKind;
  category: RecentEventCategory;
  title: string;
  meta?: string;
  at: string;
  /** "2 hours ago", resolved on the server. */
  ago: string;
  /** Full date and time for the tooltip. */
  dateLabel: string;
  href: string;
}

export type RecentActivityFilter = "all" | RecentEventCategory;

const KIND_STYLE: Record<RecentEventKind, { icon: LucideIcon; className: string }> = {
  user: { icon: UserPlus, className: "bg-sky-100 text-sky-800" },
  job: { icon: Briefcase, className: "bg-emerald-100 text-emerald-800" },
  application: { icon: FileText, className: "bg-violet-100 text-violet-800" },
  interview: { icon: CalendarClock, className: "bg-amber-100 text-amber-900" },
  placement: { icon: BadgeCheck, className: "bg-emerald-100 text-emerald-800" },
  invoice_issued: { icon: ReceiptText, className: "bg-amber-100 text-amber-900" },
  invoice_paid: { icon: Wallet, className: "bg-emerald-100 text-emerald-800" },
  subscription_started: { icon: CreditCard, className: "bg-sky-100 text-sky-800" },
  system: { icon: Settings2, className: "bg-slate-200 text-slate-800" },
};

const VISIBLE = 8;

interface AdminRecentActivityProps {
  rows: readonly RecentActivityRow[];
  filters: readonly { value: RecentActivityFilter; label: string }[];
  labels: { title: string; description: string; empty: string; emptyFiltered: string; viewAll: string; filterGroup: string };
  viewAllHref: string | null;
}

/** The latest platform events, one feed, filterable by area. */
export function AdminRecentActivity({ rows, filters, labels, viewAllHref }: AdminRecentActivityProps) {
  const [filter, setFilter] = useState<RecentActivityFilter>("all");
  const visible = (filter === "all" ? rows : rows.filter((row) => row.category === filter)).slice(0, VISIBLE);

  return (
    <section aria-labelledby="admin-recent" className={SECTION_PANEL} data-surface="light-panel">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2.5 [flex-wrap:nowrap]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-800">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="admin-recent" className="heading-section font-semibold tracking-tight text-foreground">
              {labels.title}
            </h2>
            <p className="hidden text-xs leading-4 text-muted-foreground sm:block">{labels.description}</p>
          </div>
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80">
            {labels.viewAll}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1" role="group" aria-label={labels.filterGroup}>
        <div className="flex w-max gap-1.5">
          {filters.map((option) => {
            const active = option.value === filter;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.value)}
                className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                data-recent-filter={option.value}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="workspace-subtle-surface mt-2 rounded-xl px-4 py-4 text-sm text-muted-foreground">{rows.length === 0 ? labels.empty : labels.emptyFiltered}</p>
      ) : (
        <ul className="workspace-subtle-surface mt-2 grid overflow-hidden rounded-xl lg:grid-cols-2">
          {visible.map((row) => {
            const style = KIND_STYLE[row.kind];
            const Icon = style.icon;
            return (
              <li key={row.id} className="border-b border-border/50 lg:odd:border-e" data-recent-kind={row.kind}>
                <Link
                  href={row.href}
                  className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-4"
                >
                  <span className={`shrink-0 rounded-lg p-1.5 ${style.className}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground sm:text-[13px]">{row.title}</span>
                    {row.meta && <span className="block truncate text-xs text-muted-foreground">{row.meta}</span>}
                  </span>
                  <time dateTime={row.at} title={row.dateLabel} className="shrink-0 text-xs text-muted-foreground">
                    {row.ago}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
