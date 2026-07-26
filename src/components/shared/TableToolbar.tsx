"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Search,
  FileSpreadsheet,
  FileText,
  FileDown,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TableToolbarProps {
  title?: string;
  description?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  actions?: React.ReactNode;
  filterContent?: React.ReactNode;
  hasActiveFilters?: boolean;
  defaultFiltersOpen?: boolean;
  filterLabel?: string;
  /** Render extra elements on the left */
  left?: React.ReactNode;
  /** Render extra elements on the right (before export) */
  right?: React.ReactNode;
  className?: string;
}

export function TableToolbar({
  title,
  description,
  search,
  onSearchChange,
  searchPlaceholder,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  actions,
  filterContent,
  hasActiveFilters = false,
  defaultFiltersOpen = false,
  filterLabel,
  left,
  right,
  className,
}: TableToolbarProps) {
  const t = useTranslations("common");
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("searchEllipsis");
  const resolvedFilterLabel = filterLabel ?? t("filter");
  const hasExport = onExportCsv || onExportExcel || onExportPdf;
  const usesCompactAdminLayout = Boolean(title || description || actions || filterContent);
  const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen);

  const searchControl = onSearchChange ? (
    <div className="relative">
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
      <Input
        aria-label={resolvedSearchPlaceholder}
        placeholder={resolvedSearchPlaceholder}
        value={search ?? ""}
        onChange={(e) => onSearchChange(e.target.value)}
        className={cn(
          "h-9 w-full ps-9",
          usesCompactAdminLayout ? "rounded-lg border-border bg-secondary/65 shadow-none sm:w-[220px] lg:w-[260px]" : "sm:w-[200px] lg:w-[280px]"
        )}
      />
    </div>
  ) : null;

  const exportMenu = hasExport ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("export")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
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
  ) : null;

  if (usesCompactAdminLayout) {
    return (
      <section
        className={cn("workspace-panel-surface overflow-hidden rounded-[20px]", className)}
        data-table-toolbar="compact-admin"
      >
        <div className="flex flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 xl:max-w-2xl">
            {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            {left && <div className="mt-3">{left}</div>}
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[320px] xl:items-end">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:justify-end">
              {searchControl}
              {filterContent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                  className={cn(
                    "h-9 gap-1.5 rounded-lg border-border px-3 text-sm font-medium",
                    filtersOpen ? "border-primary/30 bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-secondary"
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {resolvedFilterLabel}
                  {hasActiveFilters && (
                    <span className="ms-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                      !
                    </span>
                  )}
                </Button>
              )}
              {actions}
              {right}
              {exportMenu}
            </div>
          </div>
        </div>

        {filterContent && filtersOpen && (
          <div className="border-t border-border/70 bg-secondary/30 px-3 py-3 sm:px-5">
            {filterContent}
          </div>
        )}
      </section>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {left}
        {searchControl}
      </div>
      <div className="flex items-center gap-2">
        {right}
        {exportMenu}
      </div>
    </div>
  );
}
