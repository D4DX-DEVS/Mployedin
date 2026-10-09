"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { PlatformDataTabs } from "@/components/features/admin/PlatformDataTabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Inbox, Map } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { TableSortControl } from "@/components/shared/TableSortControl";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";

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
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<StateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "sortOrder", { allow: ["name", "nameAr", "slug", "sortOrder"] });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "asc", { allow: ["asc", "desc"] });
  const order = sortOrder === "desc" ? "desc" : "asc";
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
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
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
  }, [search, statusFilter, countryFilter, sortBy, sortOrder, page, limit, updateTotal]);

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
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: getFields() });
    }
    toast.success(t("createSuccess"));
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
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: getFields() });
    }
    toast.success(t("updateSuccess"));
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(tc("confirmDeleteState"));
    if (!ok) return;
    const res = await fetch(`/api/admin/location-data/states/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("deleteFailed"));
      return;
    }
    toast.success(t("deleteSuccess"));
    fetchItems();
  };

  const rowActionsFor = (item: StateItem): { quick: RowAction[]; menu: RowAction[] } => {
    // Edit is the everyday action: a labelled button. Delete stays in "…".
    const quick: RowAction[] = [];
    const menu: RowAction[] = [];
    if (can("location_data", "update")) {
      quick.push({
        key: "edit",
        label: t("edit"),
        icon: Pencil,
        iconOnly: true,
        onSelect: () => setEditItem(item),
      });
    }
    if (can("location_data", "delete")) {
      menu.push({
        key: "delete",
        label: t("delete"),
        icon: Trash2,
        iconOnly: true,
        onSelect: () => handleDelete(item._id),
        destructive: true,
      });
    }
    return { quick, menu };
  };

  const getCountryName = (item: StateItem): string => {
    if (typeof item.countryId === "object" && item.countryId !== null) {
      return (item.countryId as CountryOption).name;
    }
    return "—";
  };

  return (
    <div className="page-container">
      <PlatformDataTabs />
      {ConfirmDialogNode}

      {/* Employer listing shape: compact hero, then one panel holding search,
          table and pagination. */}
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Map}
        title={t("statesTitle")}
        description={t("statesSubtitle")}
        actions={
          can("location_data", "create") && (
            <Button
              onClick={() => setShowAdd(true)}
              size="sm"
              aria-label={t("addNew")}
              className="h-9 gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("addNew")}</span>
            </Button>
          )
        }
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={hasActiveFilters ? () => { setSearch(""); setStatusFilter("all"); setCountryFilter("all"); resetPage(); } : undefined}
        clearLabel={t("clear")}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); resetPage(); }}
          placeholder={t("searchStates")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={[{ value: "all", label: t("allCountries") }, ...countries.map((c) => ({ value: c._id, label: c.name }))]}
          value={countryFilter}
          onValueChange={(v) => { setCountryFilter(v); resetPage(); }}
          placeholder={t("colCountry")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("all") },
            { value: "active", label: t("active") },
            { value: "inactive", label: t("inactive") },
          ]}
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
          placeholder={t("status")}
        />
        {/* Sorting lives here as well as on the column heads: phone cards have no heads. */}
        <TableSortControl
          value={sortBy}
          onValueChange={(value) => { setSortBy(value); resetPage(); }}
          options={[{ value: "sortOrder", label: t("sortOrder") }, { value: "name", label: t("stateNameEn") }, { value: "nameAr", label: t("stateNameAr") }, { value: "slug", label: t("slug") }]}
          order={order}
          onOrderChange={(value) => { setSortOrder(value); resetPage(); }}
          className="shrink-0"
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">

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
                      <TableCell>
                        <RowActions name={item.name} {...rowActionsFor(item)} />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

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
