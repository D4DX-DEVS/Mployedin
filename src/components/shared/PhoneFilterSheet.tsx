"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PhoneFiltersButtonProps {
  activeCount: number;
  onClick: () => void;
  className?: string;
}

/**
 * Phones only: the one Filters button that replaces a list's wrapped filter
 * rows. Tinted with a count while any filter in the sheet is on, so the state
 * never rests on colour alone.
 */
export function PhoneFiltersButton({ activeCount, onClick, className }: PhoneFiltersButtonProps) {
  const t = useTranslations("common");
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      data-phone-filters=""
      aria-label={activeCount > 0 ? t("filtersOn", { count: activeCount }) : t("filters")}
      className={cn(
        "h-11 shrink-0 gap-1.5 rounded-lg px-3 text-sm sm:hidden",
        activeCount > 0 && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        className,
      )}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      <span className="max-[359px]:sr-only">{t("filters")}</span>
      {activeCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );
}

interface FilterFieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}

/** One labelled field in the sheet. The label is visible: a placeholder is not a label (WCAG 3.3.2). */
export function FilterField({ label, htmlFor, children }: FilterFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Full-width sizing for a SearchableSelect / Input / TableSortControl inside the sheet. */
export const SHEET_CONTROL = "h-11 w-full max-w-none rounded-xl border-border bg-card text-sm shadow-none";

interface PhoneFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  /** Resets every filter in the sheet. Omit when the page has nothing to clear. */
  onClear?: () => void;
  /** FilterField children, sort first. */
  children: ReactNode;
}

/**
 * Bottom sheet holding a list's filters and sort on phones. Filters apply as
 * they change; "Show results" only closes the sheet. Desktop keeps the inline
 * filter bar, so pages render this alongside InlineFilterBar and hide their
 * inline filters below `sm`.
 */
export function PhoneFilterSheet({ open, onOpenChange, activeCount, onClear, children }: PhoneFilterSheetProps) {
  const t = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-4 pb-3 pt-3.5 text-start">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t("filters")}
              {activeCount > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold">{activeCount}</span>
              )}
            </DialogTitle>
            <DialogClose
              aria-label={t("close")}
              className="-me-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">{t("filtersSheetDescription")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-background px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={!onClear || activeCount === 0}
            className="h-11 rounded-lg px-3 text-sm text-muted-foreground"
          >
            {t("clearAllFilters")}
          </Button>
          <Button onClick={() => onOpenChange(false)} className="h-11 rounded-lg px-5 text-sm font-semibold">
            {t("showResults")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
