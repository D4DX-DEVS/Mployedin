"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TableSortOption {
  value: string;
  label: string;
}

interface TableSortControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: TableSortOption[];
  order: "asc" | "desc";
  onOrderChange: (order: "asc" | "desc") => void;
  className?: string;
  compact?: boolean;
}

/** Shared sort-by control used beside table search and filters. */
export function TableSortControl({
  value,
  onValueChange,
  options,
  order,
  onOrderChange,
  className,
  compact = false,
}: TableSortControlProps) {
  const t = useTranslations("common");
  const DirectionIcon = order === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          aria-label={t("sortBy")}
          className={cn(
            "h-9 min-w-[132px] rounded-lg border-border bg-card text-sm",
            compact && "h-8 min-w-[118px] text-xs",
          )}
        >
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <SelectValue placeholder={t("sortBy")} />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn("h-9 w-9 rounded-lg border-border", compact && "h-8 w-8")}
        aria-label={order === "asc" ? t("sortAscending") : t("sortDescending")}
        onClick={() => onOrderChange(order === "asc" ? "desc" : "asc")}
      >
        <DirectionIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface SortableTableHeaderProps {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
  className?: string;
}

/** Accessible table-header button that shares the same direction state. */
export function SortableTableHeader({ label, active, order, onClick, className }: SortableTableHeaderProps) {
  const t = useTranslations("common");
  const DirectionIcon = active ? (order === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      // Preflight resets text-transform on <button>, so sortable columns read
      // "Company" beside plain "AGENT" headers; inherit the <th> casing instead.
      className={cn("inline-flex items-center gap-1.5 text-start [text-transform:inherit] hover:text-foreground", className)}
      aria-label={active
        ? `${label}, ${order === "asc" ? t("sortAscending") : t("sortDescending")}`
        : t("sortByField", { field: label })}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <DirectionIcon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground/70")} aria-hidden="true" />
    </button>
  );
}
