"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TableToolbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  /** Render extra elements on the left */
  left?: React.ReactNode;
  /** Render extra elements on the right (before export) */
  right?: React.ReactNode;
  className?: string;
}

export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search\u2026",
  onExportCsv,
  onExportExcel,
  onExportPdf,
  left,
  right,
  className,
}: TableToolbarProps) {
  const hasExport = onExportCsv || onExportExcel || onExportPdf;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {left}
        {onSearchChange && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder={searchPlaceholder}
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 w-full sm:w-[200px] lg:w-[280px] pl-9"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {right}
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
  );
}
