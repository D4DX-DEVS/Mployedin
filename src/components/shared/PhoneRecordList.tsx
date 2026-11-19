"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  /**
   * Two-row card (agent lists, owner 2026-11-12): the facts as ONE inline,
   * dot-separated line under the name — no label-over-value grid — with the
   * actions at the end of that same row instead of a footer. Empty and "—"
   * values are dropped. When set, `meta`, `stats` and the footer are not used;
   * `badges` sit under the name.
   */
  facts?: readonly ReactNode[];
  /** Facts cards only: opens the record in place (a dialog) when it has no page of its own. */
  onSelect?: () => void;
  /**
   * A row checkbox for lists that can be selected (bulk export). It starts the
   * card's header row, before the avatar, so the details under the name shift
   * in to stay lined up with it.
   */
  selection?: {
    checked: boolean;
    onToggle: () => void;
    /** Accessible name, e.g. "Select Sara Ahmed". */
    label: string;
  };
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
/** The same, past the checkbox a selectable card starts with too (44px box, 8px pulled back, 4px gap). */
const UNDER_TITLE_SELECTABLE = "ps-[5.75rem]";

/**
 * The card's row checkbox. The box stays 16px; the label around it is the 44px
 * target a thumb needs, lifted above the card's stretched link so a tap on it
 * selects instead of opening the record.
 */
function SelectBox({ selection }: { selection: NonNullable<PhoneRecord["selection"]> }) {
  return (
    <label className="relative z-10 -ms-2 -mt-1 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
      <Checkbox checked={selection.checked} onCheckedChange={selection.onToggle} aria-label={selection.label} />
    </label>
  );
}

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
      // EmptyState brings its own dashed box; inside this card that made a box in a box.
      <div className={cn("rounded-xl border border-border/70 bg-card px-4 py-10 [&_[data-empty-state]]:border-0 [&_[data-empty-state]]:bg-transparent [&_[data-empty-state]]:p-0", className)}>{empty}</div>
    ) : null;
  }

  return (
    <ul className={cn("space-y-2", className)} aria-label={label}>
      {items.map((item) => {
        const hasLeading = Boolean(item.leading);
        const underTitle = item.selection ? UNDER_TITLE_SELECTABLE : UNDER_TITLE;
        if (item.facts) return <FactsCard key={item.key} item={item} />;
        return (
          <li key={item.key} className={cn("relative rounded-xl border border-border/70 bg-card shadow-sm", compact ? "p-2.5" : "p-3")}>
            <div className="flex items-start gap-3">
              {item.selection ? (
                <div className="flex shrink-0 items-start gap-1">
                  <SelectBox selection={item.selection} />
                  {hasLeading && <div className="shrink-0">{item.leading}</div>}
                </div>
              ) : (
                hasLeading && <div className="shrink-0">{item.leading}</div>
              )}
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

            {/* Meta lines flow side by side and wrap only when they do not fit
                (2026-11-17): one fact per line made every phone card a column
                of half-empty rows ("No region set" / "Oct 21, 2026"). */}
            {item.meta && (
              // `!flex-nowrap`: the admin shell makes every flex row wrap
              // (globals.css), which split an icon from its text here.
              <div className={cn("mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground [&>*]:max-w-full [&>.flex]:!flex-nowrap", compact ? "text-[11px]" : "text-xs", hasLeading && underTitle)}>{item.meta}</div>
            )}

            {/* With a footer, badges ride at its start instead of a row of their
                own; the footer wraps them above the buttons when both don't fit. */}
            {item.badges && !item.actions && (
              <div className={cn("relative z-10 flex flex-wrap items-center text-[11px]", compact ? "mt-1.5 gap-1" : "mt-2 gap-1.5", hasLeading && underTitle)}>
                {item.badges}
              </div>
            )}

            {/* One figure reads as a single line, label then value, instead of a
                two-line box (admin commissions, 2026-11-17). */}
            {item.stats && item.stats.length === 1 && !item.actions && (
              <dl className="mt-2 flex items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
                <dt className="truncate text-[11px] text-muted-foreground">{item.stats[0].label}</dt>
                <dd className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{item.stats[0].value}</dd>
              </dl>
            )}

            {item.stats && item.stats.length > 1 && (
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
                {(item.badges || item.stats?.length === 1) && (
                  <span data-phone-card-badges="" className="me-auto flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
                    {/* A lone figure rides here too: "Commission 0%" beside the
                        buttons, not a boxed row above them. */}
                    {item.stats?.length === 1 && (
                      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-muted-foreground">{item.stats[0].label}</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{item.stats[0].value}</span>
                      </span>
                    )}
                    {item.badges}
                  </span>
                )}
                {item.actions}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function isBlankFact(fact: ReactNode): boolean {
  return fact === null || fact === undefined || fact === false || fact === "" || fact === "—";
}

/** The two-row phone card: who + status, then facts with the action beside them. */
function FactsCard({ item }: { item: PhoneRecord }) {
  const facts = (item.facts ?? []).filter((fact) => !isBlankFact(fact));
  return (
    <li className="relative rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm" data-phone-card="facts">
      <div className="flex items-start gap-2.5">
        {item.selection ? (
          <div className="flex shrink-0 items-start gap-1">
            <SelectBox selection={item.selection} />
            {item.leading && <div className="shrink-0">{item.leading}</div>}
          </div>
        ) : (
          item.leading && <div className="shrink-0">{item.leading}</div>
        )}
        <div className="min-w-0 flex-1">
          {/* The name is never cut: it may wrap, it is never truncated. */}
          <p className="break-words text-sm font-semibold leading-5 text-foreground">
            {item.href ? (
              <Link
                href={item.href}
                className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {item.title}
              </Link>
            ) : item.onSelect ? (
              <button
                type="button"
                onClick={item.onSelect}
                className="rounded-sm text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {item.title}
              </button>
            ) : (
              item.title
            )}
          </p>
          {item.subtitle && <div className="truncate text-xs leading-5 text-muted-foreground">{item.subtitle}</div>}
          {/* Badges sit under the name: inline with the facts they crushed the
              facts line to a few clipped words. */}
          {item.badges && <div className="relative z-10 mt-1 flex flex-wrap items-center gap-1 text-[11px]">{item.badges}</div>}
        </div>
        {item.trailing && <div className="relative z-10 shrink-0">{item.trailing}</div>}
      </div>
      {(facts.length > 0 || item.actions) && (
        // Facts keep at least ~9rem; when the actions need more than the rest,
        // they wrap under the facts at the end instead of crushing them.
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="line-clamp-3 min-w-[9rem] flex-1 text-xs leading-5 text-muted-foreground">
            {/* The dot rides at the end of the fact before it, so a wrapped
                line ends with "·" rather than starting with one. */}
            {facts.map((fact, index) => (
              <span key={index}>
                <span className="whitespace-nowrap">
                  {fact}
                  {index < facts.length - 1 && <span aria-hidden="true">{" ·"}</span>}
                </span>
                {index < facts.length - 1 && " "}
              </span>
            ))}
          </p>
          {item.actions && (
            <div className="relative z-10 ms-auto flex shrink-0 items-center gap-1.5 [&_a]:!min-h-8 [&_button]:!min-h-8 [&_button]:!h-8 [&_a]:!h-8 [&_button]:!text-xs">
              {item.actions}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
