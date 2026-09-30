"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { useParams, useRouter } from "next/navigation";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Inbox, Sparkles } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import type { LucideIcon } from "lucide-react";
import {
  type CmsFilterField,
  type CmsFilterValues,
  buildCmsQueryParams,
  cmsFiltersAreActive,
  getDefaultCmsFilterValues,
} from "@/components/features/admin/CmsHeroFilters";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { formatDate } from "@/lib/ui/intlFormat";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";

export interface CmsColumn {
  key: string;
  label: string;
  render?: (value: unknown, item: Record<string, unknown>) => React.ReactNode;
  /** The key is a field the page's API whitelists for `?sortBy=`. */
  sortable?: boolean;
}

const DEFAULT_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface CmsPageProps {
  apiUrl: string;
  title: string;
  titleAr?: string;
  description?: string;
  columns: CmsColumn[];
  fields: CrudField[];
  resource?: string;
  /** Show "Add New". Off for a fixed set of records (Static Pages). */
  allowCreate?: boolean;
  /** Offer Delete on each row. Off for a fixed set of records (Static Pages). */
  allowDelete?: boolean;
  editPageBasePath?: string;
  createPagePath?: string;
  icon?: LucideIcon;
  iconColor?: string;
  /** Page-specific filter fields rendered inside the hero (expand on click). */
  filterFields?: CmsFilterField[];
  searchPlaceholder?: string;
  /** The list's first order — e.g. display order for the ordered collections. */
  defaultSort?: { by: string; order: "asc" | "desc" };
}

export default function CmsPage({
  apiUrl,
  title,
  description,
  columns,
  fields,
  resource = "cms",
  allowCreate = true,
  allowDelete = true,
  editPageBasePath,
  createPagePath,
  icon: Icon,
  iconColor = "text-sky-600",
  filterFields: filterFieldsProp,
  searchPlaceholder,
  defaultSort = { by: "createdAt", order: "desc" },
}: CmsPageProps) {
  const t = useTranslations("cmsPage");
  const tf = useTranslations("formErrors");
  const tCommon = useTranslations("common");
  const { can } = usePermissions();
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filterValues, setFilterValues] = useState<CmsFilterValues>(getDefaultCmsFilterValues);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [sortBy, setSortBy] = useState(defaultSort.by);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(defaultSort.order);
  const sortOptions = [
    { value: "createdAt", label: tCommon("sortDateAdded") },
    ...columns.filter((col) => col.sortable).map((col) => ({ value: col.key, label: col.label })),
  ];
  /** Same column flips it; a new one starts at its natural first order. */
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder(field === "createdAt" || field.endsWith("At") || field === "rating" ? "desc" : "asc");
    }
    resetPage();
  };
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const filterFields = useMemo<CmsFilterField[]>(
    () => filterFieldsProp ?? [
      { type: "search", placeholder: t("searchFallback", { title: title.toLowerCase() }) },
      { type: "status", options: DEFAULT_STATUS_OPTIONS },
    ],
    [filterFieldsProp, title, t],
  );
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const hasActiveFilters = cmsFiltersAreActive(filterValues, filterFields);

  const resetFilters = useCallback(() => {
    setFilterValues(getDefaultCmsFilterValues());
    resetPage();
  }, [resetPage]);

  const fetchItems = useCallback(async () => {
    const generation = ++requestGeneration.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    try {
      const params = buildCmsQueryParams(
        filterValues,
        filterFields,
        new URLSearchParams({ page: String(page), limit: String(limit) })
      );
      // The default order is left to the API, which may break ties its own way.
      if (sortBy !== defaultSort.by || sortOrder !== defaultSort.order) {
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
      }
      setLoadError(false);
      const r = await fetch(`${apiUrl}?${params}`, { signal: controller.signal });
      if (!r.ok) throw new Error(`Failed to load ${title}: HTTP ${r.status}`);
      const d = await r.json();
      if (generation !== requestGeneration.current) return;
      setItems(d.items ?? []);
      updateTotal(d.pagination?.total ?? 0);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch CMS items:", err);
      /* Without this the catch only logged, so a failed fetch left the six CMS
         pages showing an empty table — indistinguishable from "no records". */
      if (generation === requestGeneration.current) {
        setItems([]);
        setLoadError(true);
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [apiUrl, page, limit, filterValues, filterFields, sortBy, sortOrder, defaultSort.by, defaultSort.order, title, updateTotal]);

  useEffect(() => {
    void fetchItems();
    return () => activeRequest.current?.abort();
  }, [fetchItems]);

  const normalizePayload = (values: Record<string, string>) => {
    const payload: Record<string, unknown> = { ...values };
    if (payload.isActive === "") delete payload.isActive;
    else if (payload.isActive !== undefined) payload.isActive = payload.isActive === "true";
    if (payload.sortOrder !== undefined) payload.sortOrder = parseInt(String(payload.sortOrder)) || 0;
    if (payload.rating !== undefined) payload.rating = parseInt(String(payload.rating)) || 5;
    return payload;
  };

  // The API returns per-field zod issues in `details`; showing only `error`
  // left admins with a bare "Validation failed" and no idea which field broke.
  const handleFilterChange = (next: CmsFilterValues) => {
    setFilterValues(next);
    resetPage();
  };

  const handleCreate = async (values: Record<string, string>) => {
    const payload = normalizePayload(values);
    const r = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      throw await formErrorFromResponse(r, { t: tf, locale, fieldLabels: fields });
    }
    await fetchItems();
  };

  const handleUpdate = async (values: Record<string, string>) => {
    if (!editItem) return;
    const payload = normalizePayload(values);
    const r = await fetch(`${apiUrl}/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      throw await formErrorFromResponse(r, { t: tf, locale, fieldLabels: fields });
    }
    setEditItem(null);
    await fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage"),
      confirmLabel: t("delete"),
      variant: "destructive",
    });
    if (!ok) return;
    const r = await fetch(`${apiUrl}/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const err = await r.json();
      toast.error(err.error || t("deleteFailed"));
      return;
    }
    setItems((current) => current.filter((item) => String(item._id) !== id));
    await fetchItems();
  };

  const toStringRecord = (item: Record<string, unknown>): Record<string, string> => {
    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      record[k] = v === null || v === undefined ? "" : String(v);
    }
    return record;
  };

  // Heads the "…" menu: the record's own words, never its database id.
  const rowName = (row: Record<string, unknown>) =>
    String(row.title ?? row.name ?? row.question ?? row.subject ?? row.slug ?? title);

  const canEdit = can(resource as "cms", "update");
  const canDelete = allowDelete && can(resource as "cms", "delete");

  const rowActionsFor = (row: Record<string, unknown>): { quick: RowAction[]; menu: RowAction[] } => ({
    quick: canEdit
      ? [{
          key: "edit",
          label: t("edit"),
          icon: Pencil,
          iconOnly: true,
          onSelect: () =>
            editPageBasePath
              ? router.push(`/${locale}${editPageBasePath}/${row._id}/edit`)
              : setEditItem(row),
        }]
      : [],
    menu: canDelete
      ? [{ key: "delete", label: t("delete"), icon: Trash2, iconOnly: true, destructive: true, onSelect: () => void handleDelete(String(row._id)) }]
      : [],
  });

  const activeOnPage = items.filter(
    (i) => i.isActive === true || i.status === "published"
  ).length;

  return (
    <div className="page-container admin-cms-page-container" data-admin-workspace="cms-page">
      {ConfirmDialogNode}

      <DashboardPageHeader
        icon={Icon ?? Sparkles}
        eyebrow={t("cmsWorkspace")}
        title={title}
        description={description}
        // No `summary`: "Total records" printed the same number as the
        // "Total items" metric directly beneath it.
        compact
        compactOnMobile
        actions={allowCreate && can(resource as "cms", "create") ? (
          <Button
            onClick={() =>
              createPagePath ? router.push(`/${locale}${createPagePath}`) : setShowAdd(true)
            }
            className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            {t("addNew")}
          </Button>
        ) : null}
        // "Per page" was never a metric — it is the rows-per-page control the
        // pagination footer already owns.
        metrics={[
          { label: t("totalItems"), value: total, note: t("allRecords"), icon: Icon ?? Sparkles, iconClassName: iconColor },
          { label: t("activeThisPage"), value: activeOnPage, note: t("visibleOnSite"), icon: Sparkles },
        ]}
      />

      {/* Standalone filter bar, same as admin Jobs: every filter field the page
          declares sits inline (none of the CMS pages has more than three), so
          nothing hides behind a Show Filters toggle any more. */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={hasActiveFilters ? resetFilters : undefined}
        clearLabel={t("clearFilters")}
      >
        <InlineFilterSearch
          value={filterValues.search}
          onChange={(value) => { handleFilterChange({ ...filterValues, search: value }); }}
          placeholder={
            searchPlaceholder ??
            filterFields.find((f) => f.type === "search")?.placeholder ??
            t("searchFallback", { title: title.toLowerCase() })
          }
        />
        {filterFields.map((field) => {
          if (field.type === "status") {
            return (
              <SearchableSelect
                key="status"
                id="cms-status-filter"
                ariaLabel={field.label ?? tCommon("status")}
                className={INLINE_FILTER_CONTROL}
                options={field.options}
                value={filterValues.status}
                onValueChange={(value) => { handleFilterChange({ ...filterValues, status: value }); }}
                placeholder={field.label ?? tCommon("status")}
              />
            );
          }
          if (field.type === "select") {
            return (
              <SearchableSelect
                key={field.key}
                ariaLabel={field.label}
                className={INLINE_FILTER_CONTROL}
                options={field.options}
                value={filterValues.extras[field.key] ?? "all"}
                onValueChange={(value) => { handleFilterChange({ ...filterValues, extras: { ...filterValues.extras, [field.key]: value } }); }}
                placeholder={field.placeholder ?? field.label}
              />
            );
          }
          if (field.type === "text") {
            return (
              <Input
                key={field.key}
                aria-label={field.label}
                placeholder={field.placeholder ?? field.label}
                value={filterValues.extras[field.key] ?? ""}
                onChange={(e) => { handleFilterChange({ ...filterValues, extras: { ...filterValues.extras, [field.key]: e.target.value } }); }}
                className={`${INLINE_FILTER_CONTROL} shadow-none`}
              />
            );
          }
          return null;
        })}
        <TableSortControl
          value={sortBy}
          onValueChange={(value) => { setSortBy(value); resetPage(); }}
          options={sortOptions}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto" data-mobile-table="responsive">
          <Table className="responsive-card-table">
            <TableHeader>
              <TableRow className="bg-secondary/70 hover:bg-secondary/70">
                {columns.map((col) => (
                  <TableHead key={col.key} data-label={col.label}>
                    {col.sortable ? (
                      <SortableTableHeader label={col.label} active={sortBy === col.key} order={sortOrder} onClick={() => sortByColumn(col.key)} />
                    ) : col.label}
                  </TableHead>
                ))}
                <TableHead className="text-right" data-label={tCommon("actions")}>{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="px-4 py-8 text-center sm:px-6 sm:py-16">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">{tCommon("somethingWentWrong")}</p>
                      <Button variant="outline" size="sm" onClick={() => void fetchItems()}>
                        {tCommon("tryAgain")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="px-4 py-8 text-center sm:px-6 sm:py-16">
                    <div className="flex flex-col items-center gap-2">
                      <div className="workspace-muted-pill mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-3xl sm:h-16 sm:w-16 sm:rounded-3xl">
                        <Inbox className="h-5 w-5 text-muted-foreground sm:h-7 sm:w-7" />
                      </div>
                      {/* Eyebrow duplicates the heading below it — desktop only. */}
                      <p className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block sm:text-[11px] sm:tracking-[0.18em]">
                        {hasActiveFilters ? t("noMatchingItems") : t("noItemsYet")}
                      </p>
                      <h2 className="heading-subsection mt-1 font-semibold tracking-tight text-foreground">
                        {hasActiveFilters
                          ? t("noItemsMatchFilters")
                          : t("noFoundTitle", { title: title.toLowerCase() })}
                      </h2>
                      {(hasActiveFilters || allowCreate) && (
                        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                          {hasActiveFilters
                            ? t("adjustFiltersMsg")
                            : t("clickAddNewMsg")}
                        </p>
                      )}
                      {hasActiveFilters && (
                        <Button size="sm"
                          onClick={resetFilters}
                          variant="outline"
                          className="mt-3 rounded-xl border-border bg-background/70 px-3 text-xs sm:mt-4 sm:px-4 sm:text-sm"
                        >
                          {t("clearFilters")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                    <TableRow key={String(item._id)}>
                      {columns.map((col) => (
                        <TableCell key={col.key} className="min-w-0">
                          {col.render
                            ? col.render(item[col.key], item)
                            : col.key === "isActive"
                              ? (
                                  <Badge variant={item[col.key] ? "default" : "secondary"}>
                                    {item[col.key] ? t("active") : t("inactive")}
                                  </Badge>
                                )
                              : (col.key === "createdAt" || col.key === "updatedAt" || col.key === "publishedAt" || col.key === "date")
                                ? (
                                    <span className="text-sm text-muted-foreground">
                                      {item[col.key] ? formatDate(new Date(String(item[col.key])), { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                    </span>
                                  )
                                : (
                                    <span className="line-clamp-1 max-w-xs">
                                      {String(item[col.key] ?? "")}
                                    </span>
                                  )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        {canEdit || canDelete ? (
                          <RowActions name={rowName(item)} {...rowActionsFor(item)} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        limit={limit}
        total={total}
        onPageChange={setPage}
        onLimitChange={(v) => {
          setLimit(v);
          resetPage();
        }}
      />

      {showAdd && (
        <CrudModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          title={t("addTitle", { title })}
          fields={fields}
          onSubmit={handleCreate}
        />
      )}

      {editItem && (
        <CrudModal
          open={!!editItem}
          onClose={() => setEditItem(null)}
          title={t("editTitle", { title })}
          fields={fields}
          initialValues={toStringRecord(editItem)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}
