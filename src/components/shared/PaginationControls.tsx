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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  className = "",
}: PaginationControlsProps) {
  const t = useTranslations("employerCommon");
  const { locale } = useParams<{ locale: string }>();
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px]",
        className
      )}
    >
      {/* Left: rows per page */}
      <div className="flex items-center gap-2 text-muted-foreground leading-none">
        <span className="whitespace-nowrap flex items-center h-8">{t("rowsPerPage")}</span>
        <Select
          value={String(limit)}
          onValueChange={(v) => onLimitChange(Number(v))}
        >
          <SelectTrigger className="h-8 w-[70px]" aria-label={t("rowsPerPage")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {formatNumber(size, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Center: showing X-Y of Z */}
      <span className="text-muted-foreground whitespace-nowrap">
        {t("showing")} {formatNumber(from, locale)}–{formatNumber(to, locale)} {t("of")} {formatNumber(total, locale)}
      </span>

      {/* Right: navigation buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title={t("firstPage")}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          title={t("previousPage")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-muted-foreground whitespace-nowrap tabular-nums">
          {formatNumber(page, locale)} / {formatNumber(totalPages, locale)}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          title={t("nextPage")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title={t("lastPage")}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
