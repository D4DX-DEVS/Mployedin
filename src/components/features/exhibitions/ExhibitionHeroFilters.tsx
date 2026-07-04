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
  searchPlaceholder = "Search events, agents, locations...",
  defaultExpanded = false,
}: ExhibitionHeroFiltersProps) {
  const t = useTranslations("exhibitionHeroFilters");
  const [showFilters, setShowFilters] = useState(defaultExpanded);
  const showPriority = Boolean(onPriorityChange && priorityOptions?.length);
  const showCategory = Boolean(onCategoryChange && categoryOptions?.length);
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
        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 dark:hover:bg-white/5"
        >
          <Filter className="h-4 w-4 text-muted-foreground" />
          {showFilters ? t("hideFilters") : t("showFilters")}
          {hasActiveFilters && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {t("active")}
            </Badge>
          )}
          {showFilters ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("clearFilters")}
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("status")}</label>
              <SearchableSelect
                className="h-11 w-full rounded-xl border-border bg-card"
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
                  className="h-11 w-full rounded-xl border-border bg-card"
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
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={categoryOptions!}
                  value={categoryFilter}
                  onValueChange={onCategoryChange!}
                  placeholder={t("allCategories")}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}