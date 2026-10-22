"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatNumber";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Windowed page list: 1 … p-1 p p+1 … N (max 7 items). */
function getPageItems(page: number, totalPages: number): (number | "ellipsis-l" | "ellipsis-r")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | "ellipsis-l" | "ellipsis-r")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("ellipsis-l");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < totalPages - 1) items.push("ellipsis-r");
  items.push(totalPages);
  return items;
}

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  className?: string;
  /** Rows actually rendered on this page. Pass it when the list collapses or
   *  filters rows client-side (e.g. interviews dedupe rounds), otherwise the
   *  footer claims a range wider than what the user can see. */
  shown?: number;
  /** Replaces "Rows per page" where a page is not rows (a board's columns). */
  sizeLabel?: string;
  /** Replaces "Showing X–Y of Z" where that range would not be true. */
  summary?: ReactNode;
}

export function PaginationControls({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  className = "",
  shown,
  sizeLabel,
  summary,
}: PaginationControlsProps) {
  const t = useTranslations("employerCommon");
  const { locale } = useParams<{ locale: string }>();
  const from = total === 0 || shown === 0 ? 0 : (page - 1) * limit + 1;
  const to =
    shown === undefined
      ? Math.min(page * limit, total)
      : from === 0
        ? 0
        : from + shown - 1;

  return (
    <div
      // A page that ends in this row reserves only the tab bar below it on
      // phones (globals.css), not the Copilot button's full height as well.
      data-pagination-footer=""
      className={cn(
        // Phones start-align the row: it keeps the next-page button on the
        // opposite side from the floating Copilot FAB (fixed, inline-end), so
        // the row can sit level with the button instead of ~100px above it.
        // BUG-008: from `sm` the row spreads to justify-between and its
        // last-page button sat under the Copilot FAB (inline-end 1rem, 3rem
        // wide). It used to be cleared with lg:mb-16 plus the scroller's FAB
        // reserve, a ~100px blank band under every list (owner, 10-13).
        // Reserving the FAB's width at the row's inline end clears the button
        // without the band (globals.css drops the reserve under this row).
        "flex flex-row items-center justify-start gap-2 px-1 text-xs max-sm:pe-14 sm:justify-between sm:gap-3 sm:ps-0 sm:pe-16 sm:text-[13px]",
        className
      )}
    >
      {/* Left: rows per page — label is desktop-only so phones keep one row */}
      <div className="flex items-center gap-2 text-muted-foreground leading-none">
        <span className="hidden h-11 whitespace-nowrap sm:flex sm:items-center">{sizeLabel ?? t("rowsPerPage")}</span>
        <Select
          value={String(limit)}
          onValueChange={(v) => onLimitChange(Number(v))}
        >
          <SelectTrigger className="h-11 w-[66px] sm:w-[74px]" aria-label={sizeLabel ?? t("rowsPerPage")}>
            {/* The number as children: Radix fills the trigger from its closed list, which only exists in the browser, so the box was empty until hydration. */}
            <SelectValue>{formatNumber(limit, locale)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* A page whose own size is not in the list (Resources uses 20) still
                shows it: otherwise the trigger rendered empty. */}
            {(PAGE_SIZE_OPTIONS.includes(limit) ? PAGE_SIZE_OPTIONS : [...PAGE_SIZE_OPTIONS, limit].sort((a, b) => a - b)).map((size) => (
              <SelectItem key={size} value={String(size)}>
                {formatNumber(size, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Center: showing X-Y of Z — phones drop the words, keeping "1–10 / 26" */}
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        {summary ?? (
          <>
            <span className="hidden sm:inline">{t("showing")} </span>
            {formatNumber(from, locale)}–{formatNumber(to, locale)}
            <span className="hidden sm:inline"> {t("of")} </span>
            <span className="sm:hidden"> / </span>
            {formatNumber(total, locale)}
          </>
        )}
      </span>

      {/* Right: navigation buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="hidden h-11 w-11 lg:inline-flex"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title={t("firstPage")}
          aria-label={t("firstPage")}
        >
          <ChevronsLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          title={t("previousPage")}
          aria-label={t("previousPage")}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        {/* Numbered pages (sm+); compact x/y indicator on mobile */}
        <div className="hidden lg:flex items-center gap-1">
          {getPageItems(page, totalPages).map((item) =>
            typeof item === "number" ? (
              <Button
                key={item}
                variant={item === page ? "default" : "outline"}
                size="icon"
                className="h-11 w-11 tabular-nums"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={`${t("page")} ${formatNumber(item, locale)}`}
              >
                {formatNumber(item, locale)}
              </Button>
            ) : (
              <span key={item} className="px-1 text-muted-foreground select-none">
                …
              </span>
            )
          )}
        </div>
        <span data-page-indicator="" className="px-1 text-muted-foreground whitespace-nowrap tabular-nums lg:hidden">
          {formatNumber(page, locale)} / {formatNumber(totalPages, locale)}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          title={t("nextPage")}
          aria-label={t("nextPage")}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="hidden h-11 w-11 lg:inline-flex"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title={t("lastPage")}
          aria-label={t("lastPage")}
        >
          <ChevronsRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
