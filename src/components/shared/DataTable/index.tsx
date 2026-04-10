"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useState, useCallback } from "react";
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
  isLoading,
  className,
  searchPlaceholder = "Search\u2026",
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [searchValue, setSearchValue] = useState("");

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

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {toolbarLeft}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={handleSearch}
              className="h-9 w-full sm:w-[200px] lg:w-[280px] pl-9"
            />
          </div>
          {onFiltersChange && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters</span>
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
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel>Export data</DropdownMenuLabel>
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

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-x-auto bg-card shadow-sm shadow-black/[0.03]">
        <Table>
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
                      className={cn(canSort && "cursor-pointer select-none")}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {canSort && (
                          <span className="text-muted-foreground/40">
                            {sorted === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3" />
                            )}
                          </span>
                        )}
                      </div>
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
                    <span className="text-sm">No results found.</span>
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
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange?.(Number(v))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {totalCount > 0
              ? `Showing ${from}\u2013${to} of ${totalCount}`
              : "No records"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(0)}
              disabled={pageIndex === 0}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(pageIndex - 1)}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 tabular-nums">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={() => onPageChange?.(pageCount - 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
