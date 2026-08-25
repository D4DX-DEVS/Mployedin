"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ChevronDown, ChevronUp, Filter, RotateCcw, Search } from "lucide-react";

export interface ExhibitionFilterOption {
  value: string;
  label: string;
}

export interface ExhibitionHeroFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  statusOptions: ExhibitionFilterOption[];
  priorityFilter?: string;
  onPriorityChange?: (value: string) => void;
  priorityOptions?: ExhibitionFilterOption[];
  categoryFilter?: string;
  onCategoryChange?: (value: string) => void;
  categoryOptions?: ExhibitionFilterOption[];
  searchPlaceholder?: string;
  defaultExpanded?: boolean;
}

export function exhibitionFiltersAreActive(
  search: string,
  statusFilter: string,
  priorityFilter = "all",
  categoryFilter = "all"
): boolean {
  return Boolean(
    search.trim() ||
      (statusFilter && statusFilter !== "all") ||
      (priorityFilter && priorityFilter !== "all") ||
      (categoryFilter && categoryFilter !== "all")
  );
}

interface ExhibitionFilterTriggerProps {
  open: boolean;
  onToggle: () => void;
  hasActiveFilters: boolean;
}

/** Toggle button alone, so callers can dock it inline next to a hero summary card. */
export function ExhibitionFilterTrigger({ open, onToggle, hasActiveFilters }: ExhibitionFilterTriggerProps) {
  const t = useTranslations("exhibitionHeroFilters");
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/10 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
    >
      <Filter className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
      {open ? t("hideFilters") : t("showFilters")}
      {hasActiveFilters && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {t("active")}
        </Badge>
      )}
      {open ? (
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

interface ExhibitionFilterClearButtonProps {
  onClear: () => void;
}

export function ExhibitionFilterClearButton({ onClear }: ExhibitionFilterClearButtonProps) {
  const t = useTranslations("exhibitionHeroFilters");
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClear}
      className="h-7 gap-1 px-2 text-[11px] text-muted-foreground sm:h-8 sm:gap-1.5 sm:text-xs"
    >
      <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      {t("clearFilters")}
    </Button>
  );
}

export interface ExhibitionFilterPanelProps {
  open: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  statusOptions: ExhibitionFilterOption[];
  priorityFilter?: string;
  onPriorityChange?: (value: string) => void;
  priorityOptions?: ExhibitionFilterOption[];
  categoryFilter?: string;
  onCategoryChange?: (value: string) => void;
  categoryOptions?: ExhibitionFilterOption[];
  searchPlaceholder?: string;
}

/** Search + dropdowns only, shown below the hero row once the trigger is open. */
export function ExhibitionFilterPanel({
  open,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  statusOptions,
  priorityFilter = "all",
  onPriorityChange,
  priorityOptions,
  categoryFilter = "all",
  onCategoryChange,
  categoryOptions,
  searchPlaceholder = "Search events, agents, locations...",
}: ExhibitionFilterPanelProps) {
  const t = useTranslations("exhibitionHeroFilters");
  const showPriority = Boolean(onPriorityChange && priorityOptions?.length);
  const showCategory = Boolean(onCategoryChange && categoryOptions?.length);

  if (!open) return null;

  return (
    <div className="mt-3 space-y-2.5 rounded-3xl border border-border/30 bg-background/40 backdrop-blur-sm card-pad">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-10 rounded-xl border-border bg-card pl-9 text-sm shadow-none sm:h-11"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("status")}</label>
          <SearchableSelect
            className="h-10 w-full rounded-xl border-border bg-card sm:h-11"
            options={statusOptions}
            value={statusFilter}
            onValueChange={onStatusChange}
            placeholder={t("allStatuses")}
          />
        </div>

        {showPriority && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("priority")}</label>
            <SearchableSelect
              className="h-10 w-full rounded-xl border-border bg-card sm:h-11"
              options={priorityOptions!}
              value={priorityFilter}
              onValueChange={onPriorityChange!}
              placeholder={t("allPriorities")}
            />
          </div>
        )}

        {showCategory && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("category")}</label>
            <SearchableSelect
              className="h-10 w-full rounded-xl border-border bg-card sm:h-11"
              options={categoryOptions!}
              value={categoryFilter}
              onValueChange={onCategoryChange!}
              placeholder={t("allCategories")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ExhibitionHeroFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  statusOptions,
  priorityFilter = "all",
  onPriorityChange,
  priorityOptions,
  categoryFilter = "all",
  onCategoryChange,
  categoryOptions,
  searchPlaceholder,
  defaultExpanded = false,
}: ExhibitionHeroFiltersProps) {
  const [showFilters, setShowFilters] = useState(defaultExpanded);
  const hasActiveFilters = exhibitionFiltersAreActive(
    search,
    statusFilter,
    priorityFilter,
    categoryFilter
  );

  const clearFilters = () => {
    onSearchChange("");
    onStatusChange("all");
    onPriorityChange?.("all");
    onCategoryChange?.("all");
  };

  return (
    <>
      <div className="mt-6 flex items-center justify-between border-t border-border/30 pt-5">
        <ExhibitionFilterTrigger
          open={showFilters}
          onToggle={() => setShowFilters((value) => !value)}
          hasActiveFilters={hasActiveFilters}
        />
        {hasActiveFilters && <ExhibitionFilterClearButton onClear={clearFilters} />}
      </div>

      <ExhibitionFilterPanel
        open={showFilters}
        search={search}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusChange={onStatusChange}
        statusOptions={statusOptions}
        priorityFilter={priorityFilter}
        onPriorityChange={onPriorityChange}
        priorityOptions={priorityOptions}
        categoryFilter={categoryFilter}
        onCategoryChange={onCategoryChange}
        categoryOptions={categoryOptions}
        searchPlaceholder={searchPlaceholder}
      />
    </>
  );
}