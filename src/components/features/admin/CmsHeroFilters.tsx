"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ChevronDown, ChevronUp, Filter, RotateCcw, Search } from "lucide-react";

export type CmsFilterField =
  | {
      type: "search";
      placeholder?: string;
      param?: string;
    }
  | {
      type: "status";
      label?: string;
      options: { value: string; label: string }[];
      param?: string;
    }
  | {
      type: "text";
      key: string;
      label: string;
      placeholder?: string;
      param?: string;
    }
  | {
      type: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      placeholder?: string;
      param?: string;
    };

export interface CmsFilterValues {
  search: string;
  status: string;
  extras: Record<string, string>;
}

interface CmsHeroFiltersProps {
  fields: CmsFilterField[];
  values: CmsFilterValues;
  onChange: (values: CmsFilterValues) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
  searchPlaceholder?: string;
}

export function getDefaultCmsFilterValues(): CmsFilterValues {
  return { search: "", status: "all", extras: {} };
}

export function cmsFiltersAreActive(
  values: CmsFilterValues,
  fields: CmsFilterField[]
): boolean {
  if (values.search.trim()) return true;
  if (values.status !== "all") return true;
  for (const field of fields) {
    if (field.type === "text" || field.type === "select") {
      const v = values.extras[field.key] ?? "";
      if (v && v !== "all") return true;
    }
  }
  return false;
}

export function buildCmsQueryParams(
  values: CmsFilterValues,
  fields: CmsFilterField[],
  base: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(base);
  const searchField = fields.find((f) => f.type === "search");
  if (values.search.trim()) {
    params.set(searchField?.param ?? "search", values.search.trim());
  }
  const statusField = fields.find((f) => f.type === "status");
  if (values.status && values.status !== "all") {
    params.set(statusField?.param ?? "status", values.status);
  }
  for (const field of fields) {
    if (field.type === "text" || field.type === "select") {
      const v = values.extras[field.key] ?? "";
      if (v && v !== "all") {
        params.set(field.param ?? field.key, v);
      }
    }
  }
  return params;
}

export default function CmsHeroFilters({
  fields,
  values,
  onChange,
  onReset,
  hasActiveFilters,
  showFilters,
  onToggleFilters,
  searchPlaceholder = "Search...",
}: CmsHeroFiltersProps) {
  const hasSearch = fields.some((f) => f.type === "search");
  const gridFields = fields.filter(
    (f) => f.type === "status" || f.type === "text" || f.type === "select"
  );

  const updateExtras = (key: string, value: string) => {
    onChange({
      ...values,
      extras: { ...values.extras, [key]: value },
    });
  };

  return (
    <>
      <div className="mt-6 flex items-center justify-between border-t border-border/30 pt-5">
        <button
          type="button"
          onClick={onToggleFilters}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 dark:hover:bg-white/5"
        >
          <Filter className="h-4 w-4 text-muted-foreground" />
          {showFilters ? "Hide Filters" : "Show Filters"}
          {hasActiveFilters && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              Active
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
            onClick={onReset}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
          {hasSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={values.search}
                onChange={(e) => onChange({ ...values, search: e.target.value })}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>
          )}

          {gridFields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {gridFields.map((field) => {
                if (field.type === "status") {
                  return (
                    <div key="status" className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {field.label ?? "Status"}
                      </label>
                      <SearchableSelect
                        className="h-11 w-full rounded-xl border-border bg-card"
                        options={field.options}
                        value={values.status}
                        onValueChange={(v) => onChange({ ...values, status: v })}
                        placeholder={field.label ?? "All statuses"}
                      />
                    </div>
                  );
                }
                if (field.type === "select") {
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {field.label}
                      </label>
                      <SearchableSelect
                        className="h-11 w-full rounded-xl border-border bg-card"
                        options={field.options}
                        value={values.extras[field.key] ?? "all"}
                        onValueChange={(v) => updateExtras(field.key, v)}
                        placeholder={field.placeholder ?? field.label}
                      />
                    </div>
                  );
                }
                return (
                  <div key={field.key} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </label>
                    <Input
                      placeholder={field.placeholder}
                      value={values.extras[field.key] ?? ""}
                      onChange={(e) => updateExtras(field.key, e.target.value)}
                      className="h-11 rounded-xl border-border bg-card text-sm shadow-none"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}