"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useState, useCallback, useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  SlidersHorizontal,
  Search,
  FileSpreadsheet,
  FileText,
  FileDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { formatNumber } from "@/lib/formatNumber";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Server-side pagination info */
  pageCount?: number;
  pageIndex?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearchChange?: (search: string) => void;
  onSortChange?: (sorting: SortingState) => void;
  onFiltersChange?: (filters: ColumnFiltersState) => void;
  /** Export handlers */
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  /** Render extra toolbar items */
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  /** Row click handler */
  onRowClick?: (row: TData) => void;
  /** Accessible name for an interactive row/card. */
  rowActionLabel?: (row: TData, rowIndex: number) => string;
  isLoading?: boolean;
  className?: string;
  searchPlaceholder?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataTable<TData, TValue>({
  columns,
  data,
  pageCount = 1,
  pageIndex = 0,
  pageSize = 10,
  totalCount = 0,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onSortChange,
  onFiltersChange,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  toolbarLeft,
  toolbarRight,
  onRowClick,
  rowActionLabel,
  isLoading,
  className,
  searchPlaceholder = "Search\u2026",
}: DataTableProps<TData, TValue>) {
  const t = useTranslations("dataTable");
  const tc = useTranslations("common");
  const locale = useParams<{ locale?: string }>()?.locale ?? "en";
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [searchValue, setSearchValue] = useState("");
  const searchId = useId();
  const pageSizeLabelId = useId();

  const table = useReactTable({
    data,
    columns,
    pageCount,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      pagination: { pageIndex, pageSize },
    },
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      onSortChange?.(next);
    },
    onColumnFiltersChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(columnFilters) : updater;
      setColumnFilters(next);
      onFiltersChange?.(next);
    },
    onRowSelectionChange: setRowSelection,
    onPaginationChange: (updater) => {
      const state = typeof updater === "function"
        ? updater({ pageIndex, pageSize })
        : updater;
      if (state.pageIndex !== pageIndex) onPageChange?.(state.pageIndex);
      if (state.pageSize !== pageSize) onPageSizeChange?.(state.pageSize);
    },
  });

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
      onSearchChange?.(e.target.value);
    },
    [onSearchChange]
  );

  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalCount);
  const hasExport = onExportCsv || onExportExcel || onExportPdf;

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, row: TData) => {
      if (!onRowClick || event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onRowClick(row);
    },
    [onRowClick]
  );

  const getRowActionLabel = useCallback(
    (row: TData, rowIndex: number) =>
      rowActionLabel?.(row, rowIndex) ?? `${tc("view")} ${rowIndex + 1}`,
    [rowActionLabel, tc]
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          {toolbarLeft}
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <label htmlFor={searchId} className="sr-only">
              {searchPlaceholder}
            </label>
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" aria-hidden="true" />
            <Input
              id={searchId}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={handleSearch}
              className="h-11 w-full rounded-xl ps-9 sm:h-9 sm:w-[200px] lg:w-[280px]"
            />
          </div>
          {onFiltersChange && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("filters")}</span>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbarRight}
          {hasExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
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
          )}
        </div>
      </div>

      {/* Mobile card list (<sm) — tables don't fit a phone; each row becomes a
          label/value card built from the same column defs. */}
      <div className="space-y-3 sm:hidden" aria-busy={isLoading || undefined}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
              ))}
            </div>
          ))
        ) : table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <div
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              onKeyDown={(event) => handleRowKeyDown(event, row.original)}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? getRowActionLabel(row.original, row.index) : undefined}
              className={cn(
                "workspace-panel-surface overflow-hidden rounded-xl p-3 shadow-sm shadow-black/[0.03] space-y-0",
                onRowClick && "cursor-pointer active:bg-muted/40"
              )}
            >
              {row.getVisibleCells().map((cell, cellIndex) => {
                const header = cell.column.columnDef.header;
                const label = typeof header === "string" ? header : null;
                return (
                  <div key={cell.id} className="flex min-h-9 items-start justify-between gap-3 border-b border-border/45 py-2 last:border-b-0">
                    {label && (
                      <span className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                        {label}
                      </span>
                    )}
                    <div className={cn("min-w-0 text-sm text-end tabular-nums [overflow-wrap:anywhere]", cellIndex === 0 && "font-semibold text-foreground")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-border/50 bg-card text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40" />
            <span className="text-sm">{tc("noResultsFound")}</span>
          </div>
        )}
      </div>

      {/* Table (≥sm) */}
      <div className="hidden rounded-xl border border-border/50 overflow-x-auto bg-card shadow-sm shadow-black/[0.03] sm:block">
        <Table aria-busy={isLoading || undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-muted/30 hover:bg-muted/30 border-border/50"
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        canSort
                          ? sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 rounded-sm text-start select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          <span className="text-muted-foreground/40">
                            {sorted === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3" />
                            )}
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row.original)}
                  onKeyDown={(event) => handleRowKeyDown(event, row.original)}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? getRowActionLabel(row.original, row.index) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">{tc("noResultsFound")}</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[13px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span id={pageSizeLabelId}>{t("rowsPerPage")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange?.(Number(v))}
          >
            <SelectTrigger className="h-8 w-[70px]" aria-labelledby={pageSizeLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                    {formatNumber(s, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="tabular-nums" role="status" aria-live="polite" aria-atomic="true">
            {isLoading
              ? tc("loading")
              : totalCount > 0
              ? t("showing", { from, to, total: totalCount })
              : t("noRecords")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(0)}
              disabled={pageIndex === 0}
              title={t("firstPage")}
              aria-label={t("firstPage")}
            >
              <ChevronsLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(pageIndex - 1)}
              disabled={pageIndex === 0}
              title={t("previousPage")}
              aria-label={t("previousPage")}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <span className="px-2 tabular-nums">
              {formatNumber(pageIndex + 1, locale)} / {formatNumber(pageCount, locale)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
              title={t("nextPage")}
              aria-label={t("nextPage")}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(pageCount - 1)}
              disabled={pageIndex >= pageCount - 1}
              title={t("lastPage")}
              aria-label={t("lastPage")}
            >
              <ChevronsRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
