"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Download, FileDown, FileSpreadsheet, FileText, Loader2, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Sizing for a control inside the bar (SearchableSelect trigger, Input). Grows
 * from a 6rem basis on phones (two per line beside Clear/Export) and 8rem from
 * `sm`, but stops at 14rem, so a control that wraps onto a line of its own does
 * not stretch across it; the search box, which has no cap, takes up the slack.
 * Type stays at the select's own phone size until `sm`. 44px on phones for
 * touch, 36px from `sm`.
 */
export const INLINE_FILTER_CONTROL = "h-11 min-w-0 max-w-56 flex-[1_1_6rem] rounded-lg border-border bg-card sm:h-9 sm:flex-[1_1_8rem] sm:text-sm";

/**
 * The same sizing for a wrapper that holds a label above the control: put this
 * on the wrapper and `${INLINE_FILTER_CONTROL} w-full max-w-none` on the box.
 */
export const INLINE_FILTER_FIELD = "min-w-0 max-w-56 flex-[1_1_6rem] sm:flex-[1_1_8rem]";

interface InlineFilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Hint inside the box ("Name, email or phone"). Not a label: it vanishes once typing starts. */
  placeholder: string;
  /** Visible label above the box. Defaults to "Search". */
  label?: string;
  icon?: ReactNode;
  className?: string;
  /**
   * Wait this long after the last keystroke before calling `onChange`, so a
   * list refetches once per search instead of once per letter. Enter and an
   * emptied box apply at once. Pass 0 when the page debounces the value itself.
   */
  debounceMs?: number;
  /** A search is being fetched in the background: the magnifier turns into a spinner. */
  busy?: boolean;
}

/** Search box sized for the bar: twice a select's share of the row. */
export function InlineFilterSearch({ value, onChange, placeholder, label, icon, className, debounceMs = 350, busy = false }: InlineFilterSearchProps) {
  const t = useTranslations("common");
  const id = useId();
  // The box shows `draft` as typed; the page only hears about it once typing
  // pauses. Typing letter by letter used to refetch (and flash the skeleton)
  // on every key.
  const [draft, setDraft] = useState(value);
  const sent = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // The page changed the value itself (Clear, a link, browser Back).
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setDraft(value);
    }
  }, [value]);

  const send = useCallback((next: string) => {
    if (next === sent.current) return;
    sent.current = next;
    onChangeRef.current(next);
  }, []);

  useEffect(() => {
    if (draft === sent.current) return;
    if (debounceMs <= 0 || draft === "") {
      send(draft);
      return;
    }
    const timer = setTimeout(() => send(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, debounceMs, send]);

  // Visible label (WCAG 3.3.2 / 1.3.1): the placeholder alone disappeared as
  // soon as someone typed, and on phones it was cut mid-word. The bar aligns
  // its controls to their bottom edge, so the selects beside it still line up
  // with the box, not the label.
  return (
    // Phones: search fills the first line beside the icon-only Filters
    // button (2026-11-17); anything wider (Export, worded buttons) wraps to
    // the next line instead of squeezing the box ("Search job s").
    <div className={cn("min-w-0 flex-[2_1_14rem]", className)}>
      {/* Phones: the label is screen-reader only; the magnifier and the
          placeholder already say "search", and the visible word cost the row
          a line of its own (2026-11-17). */}
      <label htmlFor={id} className="mb-1 block truncate text-xs font-medium text-muted-foreground max-sm:sr-only">
        {label ?? t("search")}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (icon ?? <Search className="h-3.5 w-3.5" />)}
        </span>
        <Input
          id={id}
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(draft); }}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border-border bg-card ps-8 text-sm shadow-none sm:h-9"
        />
      </div>
    </div>
  );
}

interface InlineFilterBarProps {
  /** Primary filters. One line on desktop; they wrap inside their own group. */
  children: ReactNode;
  /** Secondary filters, on a second line behind a toggle. */
  more?: ReactNode;
  moreLabel?: string;
  /** How many of the `more` filters are set. Opens the second line on mount so an active filter is never hidden. */
  moreActiveCount?: number;
  /** Controlled open state, for pages whose own logic (an AI search setting a date) opens the second line. */
  moreOpen?: boolean;
  onMoreOpenChange?: (open: boolean) => void;
  /** e.g. `max-sm:hidden` on a page whose phones use a filter sheet instead. */
  moreToggleClassName?: string;
  moreClassName?: string;
  /** Shown before Clear/Export when there are active filters. */
  onClear?: () => void;
  clearLabel?: string;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  /** Extra export menu items after the formats (e.g. "Download CVs"). */
  exportExtra?: ReactNode;
  /** Below the controls — e.g. the summary an AI search produced. */
  footer?: ReactNode;
  /**
   * Phones only (below `sm`): a full-width row under the first line, in place
   * of controls the page hides there with `max-sm:hidden`. Shown and hidden
   * with CSS, so a phone's first paint (and a page with scripts off) already
   * has it. Nothing is rendered when it is not passed; from `sm` up it is
   * never shown.
   */
  phoneRow?: ReactNode;
  className?: string;
}

/**
 * The admin list filter row: every filter visible at once, with Clear and
 * Export pinned to the right of the first line. Replaces the Show/Hide
 * Filters panel that expanded the page header into a second page.
 */
export function InlineFilterBar({
  children,
  more,
  moreLabel,
  moreActiveCount = 0,
  moreOpen: moreOpenProp,
  onMoreOpenChange,
  moreToggleClassName,
  moreClassName,
  onClear,
  clearLabel,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  exportExtra,
  footer,
  phoneRow,
  className,
}: InlineFilterBarProps) {
  const t = useTranslations("common");
  const [moreOpenState, setMoreOpenState] = useState(moreActiveCount > 0);
  const moreOpen = moreOpenProp ?? moreOpenState;
  const toggleMore = () => {
    setMoreOpenState(!moreOpen);
    onMoreOpenChange?.(!moreOpen);
  };
  const hasExport = Boolean(onExportCsv || onExportExcel || onExportPdf);

  return (
    // `.panel-head` is a centred flex *row*; without flex-col the More line
    // and the footer became extra columns beside the filters.
    <div className={cn("panel-head flex-col items-stretch gap-2", className)}>
      {/* items-end: the search box carries a label above it, so controls align
          on their bottom edge to sit level with the box. */}
      {/* Phones: one wrapping line for everything (the filter group dissolves
          into it), so the search can own a full row and Export sits at the end
          of the next. From sm: filters on the left, Clear/Export pinned right. */}
      <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 max-sm:contents">
          {children}
          {more && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleMore}
              aria-expanded={moreOpen}
              className={cn(
                "h-11 shrink-0 gap-1.5 rounded-lg px-3 text-sm sm:h-9",
                moreOpen && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
                moreToggleClassName,
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {moreLabel ?? t("filter")}
              {moreActiveCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-primary-foreground">
                  {moreActiveCount}
                </span>
              )}
            </Button>
          )}
        </div>

        {(onClear || hasExport) && (
          <div className="flex shrink-0 items-center gap-2 max-sm:ms-auto">
            {onClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                data-filter-clear=""
                className="h-11 gap-1.5 px-2.5 text-xs text-muted-foreground sm:h-9"
              >
                {/* Phones keep the word and drop the icon: a button says what it
                    does at every width, and the word is the narrower of the two. */}
                <RotateCcw className="h-3.5 w-3.5 max-sm:hidden" aria-hidden="true" />
                <span>{clearLabel ?? t("clear")}</span>
              </Button>
            )}
            {hasExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* Phones: icon-only square like the Filters button, so search +
                      Filters + Export share one line. Worded, it wrapped onto a
                      line of its own under the search (2026-11-17). */}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t("export")}
                    title={t("export")}
                    className="h-11 gap-1.5 rounded-lg px-3 max-sm:w-11 max-sm:p-0 sm:h-9"
                  >
                    <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                    <span className="max-sm:sr-only">{t("export")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuLabel>{t("exportData")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {onExportCsv && (
                    <DropdownMenuItem onClick={onExportCsv}>
                      <FileDown className="h-4 w-4" />
                      CSV
                    </DropdownMenuItem>
                  )}
                  {onExportExcel && (
                    <DropdownMenuItem onClick={onExportExcel}>
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel
                    </DropdownMenuItem>
                  )}
                  {onExportPdf && (
                    <DropdownMenuItem onClick={onExportPdf}>
                      <FileText className="h-4 w-4" />
                      PDF
                    </DropdownMenuItem>
                  )}
                  {exportExtra && (
                    <>
                      <DropdownMenuSeparator />
                      {exportExtra}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {phoneRow && <div className="sm:hidden">{phoneRow}</div>}

      {more && moreOpen && (
        <div className={cn("flex flex-wrap items-end gap-2 border-t border-border/60 pt-2", moreClassName)}>
          {more}
        </div>
      )}

      {footer}
    </div>
  );
}
