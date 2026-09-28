"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Download, FileDown, FileSpreadsheet, FileText, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

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

interface InlineFilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: ReactNode;
  className?: string;
}

/** Search box sized for the bar: twice a select's share of the row. */
export function InlineFilterSearch({ value, onChange, placeholder, icon, className }: InlineFilterSearchProps) {
  return (
    <div className={cn("relative min-w-0 flex-[2_1_14rem]", className)}>
      <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        {icon ?? <Search className="h-3.5 w-3.5" />}
      </span>
      <Input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border-border bg-card ps-8 text-sm shadow-none sm:h-9"
      />
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
  /** Below the controls — e.g. the summary an AI search produced. */
  footer?: ReactNode;
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
  footer,
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
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
          <div className="flex shrink-0 items-center gap-2">
            {onClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                aria-label={clearLabel ?? t("clear")}
                className="h-11 gap-1.5 px-2.5 text-xs text-muted-foreground sm:h-9"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="max-sm:hidden">{clearLabel ?? t("clear")}</span>
              </Button>
            )}
            {hasExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* Label hidden on phones, so name the trigger explicitly. */}
                  <Button variant="outline" size="sm" aria-label={t("export")} className="h-11 w-11 gap-1.5 rounded-lg p-0 sm:h-9 sm:w-auto sm:px-3">
                    <Download className="h-3.5 w-3.5" />
                    <span className="max-sm:hidden">{t("export")}</span>
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {more && moreOpen && (
        <div className={cn("flex flex-wrap items-center gap-2 border-t border-border/60 pt-2", moreClassName)}>
          {more}
        </div>
      )}

      {footer}
    </div>
  );
}
