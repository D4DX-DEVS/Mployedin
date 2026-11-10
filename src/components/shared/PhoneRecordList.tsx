"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneRecordStat {
  label: string;
  value: ReactNode;
}

export interface PhoneRecord {
  key: string;
  /** Opens the record. The whole card becomes the tap target (stretched link). */
  href?: string;
  /** Avatar or icon, 40px. */
  leading?: ReactNode;
  title: ReactNode;
  /** One line under the title: email, company, reference number. */
  subtitle?: ReactNode;
  /** Top-end corner: usually the status badge. */
  trailing?: ReactNode;
  /** Small lines under the header: location, dates, amounts. */
  meta?: ReactNode;
  /** Chips row: performance, premium, tags. */
  badges?: ReactNode;
  /** Up to four labelled figures in a compact strip. */
  stats?: readonly PhoneRecordStat[];
  /** Row actions (RowActions menu, icon buttons). Stay clickable above the card link. */
  actions?: ReactNode;
}

interface PhoneRecordListProps {
  items: readonly PhoneRecord[];
  loading?: boolean;
  /** Rendered when there are no items (EmptyState with its own action). */
  empty?: ReactNode;
  /** Usually "sm:hidden": the table keeps desktop. */
  className?: string;
  /** Accessible name for the list, e.g. the page title. */
  label?: string;
  /** Denser cards (smaller text, tighter gaps) for lists with many rows per record. */
  compact?: boolean;
}

/** Lines detail rows up under the title, past the 40px leading slot. */
const UNDER_TITLE = "ps-[3.25rem]";

/**
 * Phone list of records, one card per row. Replaces the generic
 * table-to-card fallback (ResponsiveTables), which re-flowed each page's table
 * cells into cards and left avatars beside empty lines, labels in odd columns
 * and actions on rows of their own. Pages render this below `sm` and keep the
 * table (with data-mobile-table="scroll") from `sm` up.
 */
export function PhoneRecordList({ items, loading, empty, className, label, compact }: PhoneRecordListProps) {
  if (loading) {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return empty ? (
      <div className={cn("rounded-xl border border-border/70 bg-card px-4 py-10", className)}>{empty}</div>
    ) : null;
  }

  return (
    <ul className={cn("space-y-2", className)} aria-label={label}>
      {items.map((item) => {
        const hasLeading = Boolean(item.leading);
        return (
          <li key={item.key} className={cn("relative rounded-xl border border-border/70 bg-card shadow-sm", compact ? "p-2.5" : "p-3")}>
            <div className="flex items-start gap-3">
              {hasLeading && <div className="shrink-0">{item.leading}</div>}
              <div className="min-w-0 flex-1">
                {/* Header = identity only: name, status, subtitle. Buttons live in
                    the footer row; beside the name they crushed it ("(b I…"),
                    and wrapped under it they floated mid-card. */}
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("line-clamp-2 min-w-0 flex-1 font-semibold text-foreground", compact ? "text-[13px] leading-[18px]" : "text-sm leading-5")}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  {item.trailing && <div className="relative z-10 shrink-0">{item.trailing}</div>}
                  {item.href && !item.trailing && (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                  )}
                </div>
                {item.subtitle && (
                  <div className="truncate text-xs leading-5 text-muted-foreground">{item.subtitle}</div>
                )}
              </div>
            </div>

            {item.meta && (
              <div className={cn("mt-1 space-y-0.5 text-muted-foreground", compact ? "text-[11px]" : "text-xs", hasLeading && UNDER_TITLE)}>{item.meta}</div>
            )}

            {item.badges && (
              <div className={cn("relative z-10 flex flex-wrap items-center text-[11px]", compact ? "mt-1.5 gap-1" : "mt-2 gap-1.5", hasLeading && UNDER_TITLE)}>
                {item.badges}
              </div>
            )}

            {item.stats && item.stats.length > 0 && (
              <dl
                className={cn(
                  "mt-2.5 grid divide-x divide-border/60 rounded-lg bg-muted/40 py-1.5 text-center rtl:divide-x-reverse",
                  item.stats.length === 1 && "grid-cols-1",
                  item.stats.length === 2 && "grid-cols-2",
                  item.stats.length === 3 && "grid-cols-3",
                  item.stats.length >= 4 && "grid-cols-4",
                )}
              >
                {item.stats.map((s) => (
                  // dt must come first in the markup; flex-col-reverse puts the figure on top.
                  <div key={s.label} className="flex min-w-0 flex-col-reverse px-1">
                    <dt className="truncate text-[11px] text-muted-foreground">{s.label}</dt>
                    <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Pages often pass their buttons inside one non-wrapping row; with
                justify-end, a row wider than the card pushed its first button
                off the left edge. Let that inner row wrap too. */}
            {item.actions && (
              <div className={cn(
                "phone-record-actions relative z-10 flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 [&>*]:max-w-full [&>div]:flex-wrap [&>div]:justify-end [&>span]:flex-wrap [&>span]:justify-end",
                compact ? "mt-1.5 pt-1.5 [&_button]:!min-h-9 [&_button]:!text-xs [&_a]:!min-h-9" : "mt-2.5 pt-2.5",
              )}>
                {item.actions}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
