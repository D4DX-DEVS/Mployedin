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
import { Plus, Pencil, Trash2, Inbox, Globe } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { TableSortControl } from "@/components/shared/TableSortControl";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";

interface CountryItem {
  _id: string;
  name: string;
  nameAr: string;
  code: string;
  phoneCode: string;
  currency: string;
  currencyCode: string;
  currencySymbol: string;
  thousandSeparator: string;
  decimalSeparator: string;
  sortOrder: number;
  isActive: boolean;
}

export default function CountriesPage() {
  const t = useTranslations("adminLocationData");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const { can } = usePermissions();

  const CREATE_FIELDS: CrudField[] = [
    { name: "name", label: t("countryNameEn"), type: "text", required: true, placeholder: t("countryNamePlaceholder") },
    { name: "nameAr", label: t("countryNameAr"), type: "text", placeholder: t("countryNameArPlaceholder") },
    { name: "code", label: t("shortName"), type: "text", required: true, placeholder: t("shortNamePlaceholder") },
    { name: "phoneCode", label: t("phoneCode"), type: "text", placeholder: t("phoneCodePlaceholder") },
    { name: "currency", label: t("currency"), type: "text", placeholder: t("currencyPlaceholder") },
    { name: "currencyCode", label: t("currencyCode"), type: "text", placeholder: t("currencyCodePlaceholder") },
    { name: "currencySymbol", label: t("currencySymbol"), type: "text", placeholder: t("currencySymbolPlaceholder") },
    { name: "thousandSeparator", label: t("thousandSep"), type: "text", placeholder: "," },
    { name: "decimalSeparator", label: t("decimalSep"), type: "text", placeholder: "." },
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
  ];
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<CountryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "sortOrder", { allow: ["name", "nameAr", "code", "sortOrder"] });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "asc", { allow: ["asc", "desc"] });
  const order = sortOrder === "desc" ? "desc" : "asc";
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<CountryItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/location-data/countries?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [search, statusFilter, sortBy, sortOrder, page, limit, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all";

  const handleCreate = async (values: Record<string, string>) => {
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      code: values.code,
      phoneCode: values.phoneCode || "",
      currency: values.currency || "",
      currencyCode: values.currencyCode || "",
      currencySymbol: values.currencySymbol || "",
      thousandSeparator: values.thousandSeparator || ",",
      decimalSeparator: values.decimalSeparator || ".",
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    const res = await fetch("/api/admin/location-data/countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: CREATE_FIELDS });
    }
    toast.success(t("createSuccess"));
    fetchItems();
  };

  const handleEdit = async (values: Record<string, string>) => {
    if (!editItem) return;
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      code: values.code,
      phoneCode: values.phoneCode || "",
      currency: values.currency || "",
      currencyCode: values.currencyCode || "",
      currencySymbol: values.currencySymbol || "",
      thousandSeparator: values.thousandSeparator || ",",
      decimalSeparator: values.decimalSeparator || ".",
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    const res = await fetch(`/api/admin/location-data/countries/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: CREATE_FIELDS });
    }
    toast.success(t("updateSuccess"));
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("confirmDeleteCountry"));
    if (!ok) return;
    const res = await fetch(`/api/admin/location-data/countries/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("deleteFailed"));
      return;
    }
    toast.success(t("deleteSuccess"));
    fetchItems();
  };

  const rowActionsFor = (item: CountryItem): { quick: RowAction[]; menu: RowAction[] } => {
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

  return (
    <div className="page-container">
      <PlatformDataTabs />
      {ConfirmDialogNode}

      {/* Employer listing shape: compact hero, then one panel holding search,
          table and pagination. */}
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Globe}
        title={t("countriesTitle")}
        description={t("countriesSubtitle")}
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
        onClear={hasActiveFilters ? () => { setSearch(""); setStatusFilter("all"); resetPage(); } : undefined}
        clearLabel={t("clear")}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); resetPage(); }}
          placeholder={t("searchCountries")}
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
          options={[{ value: "sortOrder", label: t("sortOrder") }, { value: "name", label: t("countryNameEn") }, { value: "nameAr", label: t("countryNameAr") }, { value: "code", label: t("shortName") }]}
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
                <TableHead data-label={t("shortName")}>{t("shortName")}</TableHead>
                <TableHead data-label={t("phoneCode")} className="hidden sm:table-cell">{t("phoneCode")}</TableHead>
                <TableHead data-label={t("currency")} className="hidden lg:table-cell">{t("currency")}</TableHead>
                <TableHead data-label={t("currencyCode")} className="hidden lg:table-cell">{t("currencyCode")}</TableHead>
                <TableHead data-label={t("currencySymbol")} className="hidden xl:table-cell">{t("currencySymbol")}</TableHead>
                {/* Separators only matter when editing; below 2xl they give way so
                    Actions stays on screen. */}
                <TableHead data-label={t("thousandSep")} className="hidden 2xl:table-cell">{t("thousandSep")}</TableHead>
                <TableHead data-label={t("decimalSep")} className="hidden 2xl:table-cell">{t("decimalSep")}</TableHead>
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
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={10} className="px-4 py-8 text-center sm:px-6 sm:py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="h-5 w-5 text-muted-foreground/50 sm:h-6 sm:w-6" />
                      <p className="text-xs font-medium text-foreground sm:text-sm">{t("noCountriesFound")}</p>
                      <p className="text-xs text-muted-foreground">{t("adjustFiltersCountry")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className="border-border/70">
                    <TableCell className="font-medium text-foreground min-w-0 truncate">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground min-w-0 truncate">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">{item.phoneCode || "—"}</TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">{item.currency || "—"}</TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">{item.currencyCode || "—"}</TableCell>
                    <TableCell className="text-muted-foreground hidden xl:table-cell">{item.currencySymbol || "—"}</TableCell>
                    <TableCell className="text-muted-foreground hidden 2xl:table-cell">{item.thousandSeparator || "—"}</TableCell>
                    <TableCell className="text-muted-foreground hidden 2xl:table-cell">{item.decimalSeparator || "—"}</TableCell>
                    <TableCell className="text-center"><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>
                    {(can("location_data", "update") || can("location_data", "delete")) && (
                      <TableCell>
                        <RowActions name={item.name} labelsFrom="wide" {...rowActionsFor(item)} />
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
        title={t("addCountryTitle")}
        fields={CREATE_FIELDS}
        onSubmit={handleCreate}
      />

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={t("editCountryTitle")}
        fields={CREATE_FIELDS}
        initialValues={
          editItem
            ? {
                name: editItem.name ?? "",
                nameAr: editItem.nameAr ?? "",
                code: editItem.code ?? "",
                phoneCode: editItem.phoneCode ?? "",
                currency: editItem.currency ?? "",
                currencyCode: editItem.currencyCode ?? "",
                currencySymbol: editItem.currencySymbol ?? "",
                thousandSeparator: editItem.thousandSeparator ?? ",",
                decimalSeparator: editItem.decimalSeparator ?? ".",
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
