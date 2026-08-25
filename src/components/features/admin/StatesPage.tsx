"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Inbox, SlidersHorizontal, RotateCcw } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useTranslations } from "next-intl";

interface CountryOption {
  _id: string;
  name: string;
  nameAr: string;
  code: string;
}

interface StateItem {
  _id: string;
  name: string;
  nameAr: string;
  slug: string;
  countryId: CountryOption | string;
  sortOrder: number;
  isActive: boolean;
}

export default function StatesPage() {
  const { can } = usePermissions();
  const tc = useTranslations("common");
  const t = useTranslations("adminLocationData");
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<StateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<StateItem | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/location-data/countries?limit=300&status=active");
        if (res.ok) {
          const data = await res.json();
          setCountries(data.items ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (countryFilter && countryFilter !== "all") params.set("countryId", countryFilter);
      const res = await fetch(`/api/admin/location-data/states?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [search, statusFilter, countryFilter, page, limit, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all" || countryFilter !== "all";

  const getFields = useCallback((): CrudField[] => [
    { name: "name", label: t("stateNameEn"), type: "text", required: true, placeholder: t("stateNamePlaceholder") },
    { name: "nameAr", label: t("stateNameAr"), type: "text", placeholder: t("stateNameArPlaceholder") },
    {
      name: "countryId",
      label: t("colCountry"),
      type: "select",
      required: true,
      options: countries.map((c) => ({ value: c._id, label: `${c.name} (${c.code})` })),
    },
    { name: "slug", label: t("slug"), type: "text", placeholder: t("slugPlaceholder") },
    { name: "sortOrder", label: t("sortOrder"), type: "number", placeholder: "0" },
    {
      name: "isActive",
      label: t("status"),
      type: "select",
      options: [
        { value: "true", label: t("active") },
        { value: "false", label: t("inactive") },
      ],
    },
  ], [countries, t]);

  const handleCreate = async (values: Record<string, string>) => {
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      countryId: values.countryId,
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    if (values.slug) body.slug = values.slug;
    const res = await fetch("/api/admin/location-data/states", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error ?? tc("failedToCreate"));
    }
    fetchItems();
  };

  const handleEdit = async (values: Record<string, string>) => {
    if (!editItem) return;
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      countryId: values.countryId,
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    if (values.slug) body.slug = values.slug;
    const res = await fetch(`/api/admin/location-data/states/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error ?? tc("failedToUpdate"));
    }
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(tc("confirmDeleteState"));
    if (!ok) return;
    await fetch(`/api/admin/location-data/states/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const getCountryName = (item: StateItem): string => {
    if (typeof item.countryId === "object" && item.countryId !== null) {
      return (item.countryId as CountryOption).name;
    }
    return "—";
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* Compact header row: mobile stacked, desktop row */}
        <div className="flex flex-col gap-3 border-b border-border/80 sm:flex-row sm:items-center sm:justify-between panel-head">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-lg">{t("statesTitle")}</h1>
            <p className="hidden text-xs text-muted-foreground sm:mt-0.5 sm:block">{t("statesSubtitle")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-states-search"
                placeholder={t("searchStates")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="h-9 w-full rounded-lg border-border bg-secondary/65 pl-8 text-sm shadow-none sm:w-48"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
                className={`h-9 gap-1.5 rounded-lg border-border px-3 text-sm font-medium shrink-0 ${showFilters ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-foreground hover:bg-secondary"}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("filter")}</span>
                {hasActiveFilters && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">!</span>}
              </Button>
              {can("location_data", "create") && (
                <Button
                  onClick={() => setShowAdd(true)}
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("addNew")}</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible filter panel: stacked on mobile */}
        {showFilters && (
          <div className="grid gap-2 bg-secondary/30 sm:gap-3 sm:flex sm:flex-wrap sm:items-center panel-head">
            <label htmlFor="admin-states-country" className="text-xs font-medium text-muted-foreground">{t("colCountry")}</label>
            <SearchableSelect
              id="admin-states-country"
              className="h-9 w-full rounded-lg border-border bg-card text-sm sm:w-[180px] sm:h-8"
              options={[{ value: "all", label: t("allCountries") }, ...countries.map((c) => ({ value: c._id, label: c.name }))]}
              value={countryFilter}
              onValueChange={(v) => { setCountryFilter(v); resetPage(); }}
              placeholder={t("colCountry")}
            />
            <label htmlFor="admin-states-status" className="text-xs font-medium text-muted-foreground">{t("status")}</label>
            <SearchableSelect
              id="admin-states-status"
              className="h-9 w-full rounded-lg border-border bg-card text-sm sm:w-[140px] sm:h-8"
              options={[
                { value: "all", label: t("all") },
                { value: "active", label: t("active") },
                { value: "inactive", label: t("inactive") },
              ]}
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
              placeholder={t("status")}
            />
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setStatusFilter("all"); setCountryFilter("all"); resetPage(); }}
                className="h-9 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground sm:h-8"
              >
                <RotateCcw className="h-3 w-3" /> {t("clear")}
              </Button>
            )}
          </div>
        )}

        {/* Table: semantic table with responsive-card-table */}
        <div className="overflow-x-auto" data-mobile-table="responsive">
          <Table className="responsive-card-table">
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead data-label={t("colCountry")}>{t("colCountry")}</TableHead>
                <TableHead data-label={t("colState")}>{t("colState")}</TableHead>
                <TableHead data-label={t("status")}>{t("status")}</TableHead>
                {(can("location_data", "update") || can("location_data", "delete")) && (
                  <TableHead className="text-right" data-label={t("actions")}>{t("actions")}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={4} className="px-4 py-8 text-center sm:px-6 sm:py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="h-5 w-5 text-muted-foreground/50 sm:h-6 sm:w-6" />
                      <p className="text-xs font-medium text-foreground sm:text-sm">{t("noStatesFound")}</p>
                      <p className="text-xs text-muted-foreground">{t("adjustFiltersState")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className="border-border/70">
                    <TableCell className="text-muted-foreground min-w-0 truncate">{getCountryName(item)}</TableCell>
                    <TableCell className="font-medium text-foreground min-w-0 truncate">{item.name}</TableCell>
                    <TableCell className="text-center"><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>
                    {(can("location_data", "update") || can("location_data", "delete")) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {can("location_data", "update") && (
                            <Button variant="ghost" size="sm" onClick={() => setEditItem(item)} title={t("edit")} aria-label={t("editItem", { name: item.name })} className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          {can("location_data", "delete") && (
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(item._id)} title={t("delete")} aria-label={t("deleteItem", { name: item.name })} className="h-8 w-8">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-4 py-3 sm:px-5">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>

      <CrudModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t("addStateTitle")}
        fields={getFields()}
        onSubmit={handleCreate}
      />

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={t("editStateTitle")}
        fields={getFields()}
        initialValues={
          editItem
            ? {
                name: editItem.name ?? "",
                nameAr: editItem.nameAr ?? "",
                countryId: typeof editItem.countryId === "object"
                  ? (editItem.countryId as CountryOption)._id
                  : (editItem.countryId as string) ?? "",
                slug: editItem.slug ?? "",
                sortOrder: String(editItem.sortOrder ?? 0),
                isActive: String(editItem.isActive ?? true),
              }
            : undefined
        }
        onSubmit={handleEdit}
      />
    </div>
  );
}
