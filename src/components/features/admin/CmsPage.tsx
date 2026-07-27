"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import CmsHeroFilters, {
  type CmsFilterField,
  type CmsFilterValues,
  buildCmsQueryParams,
  cmsFiltersAreActive,
  getDefaultCmsFilterValues,
} from "@/components/features/admin/CmsHeroFilters";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

export interface CmsColumn {
  key: string;
  label: string;
  render?: (value: unknown, item: Record<string, unknown>) => React.ReactNode;
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
  allowCreate?: boolean;
  editPageBasePath?: string;
  createPagePath?: string;
  icon?: LucideIcon;
  iconColor?: string;
  /** Page-specific filter fields rendered inside the hero (expand on click). */
  filterFields?: CmsFilterField[];
  searchPlaceholder?: string;
}

export default function CmsPage({
  apiUrl,
  title,
  description,
  columns,
  fields,
  resource = "cms",
  allowCreate = true,
  editPageBasePath,
  createPagePath,
  icon: Icon,
  iconColor = "text-sky-600",
  filterFields: filterFieldsProp,
  searchPlaceholder,
}: CmsPageProps) {
  const t = useTranslations("cmsPage");
  const { can } = usePermissions();
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<CmsFilterValues>(getDefaultCmsFilterValues);
  const [showFilters, setShowFilters] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const filterFields: CmsFilterField[] = filterFieldsProp ?? [
    { type: "search", placeholder: `Search ${title.toLowerCase()}…` },
    { type: "status", options: DEFAULT_STATUS_OPTIONS },
  ];

  const hasActiveFilters = cmsFiltersAreActive(filterValues, filterFields);

  const resetFilters = useCallback(() => {
    setFilterValues(getDefaultCmsFilterValues());
    resetPage();
  }, [resetPage]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildCmsQueryParams(
        filterValues,
        filterFields,
        new URLSearchParams({ page: String(page), limit: String(limit) })
      );
      const r = await fetch(`${apiUrl}?${params}`);
      const d = await r.json();
      setItems(d.items ?? []);
      updateTotal(d.pagination?.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch CMS items:", err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, page, limit, filterValues, filterFields, updateTotal]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleFilterChange = (next: CmsFilterValues) => {
    setFilterValues(next);
    resetPage();
  };

  const handleCreate = async (values: Record<string, string>) => {
    const payload: Record<string, unknown> = { ...values };
    if (payload.isActive !== undefined) payload.isActive = payload.isActive === "true";
    if (payload.sortOrder !== undefined) payload.sortOrder = parseInt(String(payload.sortOrder)) || 0;
    if (payload.rating !== undefined) payload.rating = parseInt(String(payload.rating)) || 5;
    const r = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || "Failed to create");
    }
    fetchItems();
  };

  const handleUpdate = async (values: Record<string, string>) => {
    if (!editItem) return;
    const payload: Record<string, unknown> = { ...values };
    if (payload.isActive !== undefined) payload.isActive = payload.isActive === "true";
    if (payload.sortOrder !== undefined) payload.sortOrder = parseInt(String(payload.sortOrder)) || 0;
    if (payload.rating !== undefined) payload.rating = parseInt(String(payload.rating)) || 5;
    const r = await fetch(`${apiUrl}/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || "Failed to update");
    }
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Are you sure you want to delete this item?");
    if (!ok) return;
    const r = await fetch(`${apiUrl}/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const err = await r.json();
      toast.error(err.error || "Failed to delete");
      return;
    }
    fetchItems();
  };

  const toStringRecord = (item: Record<string, unknown>): Record<string, string> => {
    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      record[k] = v === null || v === undefined ? "" : String(v);
    }
    return record;
  };

  const activeOnPage = items.filter(
    (i) => i.isActive === true || i.status === "published"
  ).length;

  return (
    <div className="page-container admin-cms-page-container space-y-6" data-admin-workspace="cms-page">
      {ConfirmDialogNode}

      <DashboardPageHeader
        icon={Icon ?? Sparkles}
        eyebrow={t("cmsWorkspace")}
        title={title}
        description={description}
        summary={{ label: t("totalRecords"), value: total.toLocaleString(), note: t("acrossPages", { count: totalPages }) }}
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
        metrics={[
          { label: t("totalItems"), value: total, note: t("allRecords"), icon: Icon ?? Sparkles, iconClassName: iconColor },
          { label: t("activeThisPage"), value: activeOnPage, note: t("visibleOnSite"), icon: Sparkles },
          { label: t("perPage"), value: limit, note: t("itemsShownPerPage"), icon: Sparkles },
        ]}
      >
        <CmsHeroFilters
          fields={filterFields}
          values={filterValues}
          onChange={handleFilterChange}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          searchPlaceholder={
            searchPlaceholder ??
            filterFields.find((f) => f.type === "search")?.placeholder ??
            `Search ${title.toLowerCase()}…`
          }
        />
      </DashboardPageHeader>

      <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/70 hover:bg-secondary/70">
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
                <TableHead className="w-[100px]">{t("actions")}</TableHead>
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
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="workspace-muted-pill mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-[24px]">
                        <Inbox className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {hasActiveFilters ? t("noMatchingItems") : t("noItemsYet")}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                        {hasActiveFilters
                          ? t("noItemsMatchFilters")
                          : t("noFoundTitle", { title: title.toLowerCase() })}
                      </h3>
                      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                        {hasActiveFilters
                          ? t("adjustFiltersMsg")
                          : t("clickAddNewMsg")}
                      </p>
                      {hasActiveFilters && (
                        <Button
                          onClick={resetFilters}
                          variant="outline"
                          className="mt-4 h-9 rounded-xl border-border bg-background/70 px-4 text-sm"
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
                      <TableCell key={col.key}>
                        {col.render
                          ? col.render(item[col.key], item)
                          : col.key === "isActive"
                            ? (
                                <Badge variant={item[col.key] ? "default" : "secondary"}>
                                  {item[col.key] ? t("active") : t("inactive")}
                                </Badge>
                              )
                            : (
                                <span className="line-clamp-1 max-w-xs">
                                  {String(item[col.key] ?? "")}
                                </span>
                              )}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {allowCreate && can(resource as "cms", "update") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              editPageBasePath
                                ? router.push(`/${locale}${editPageBasePath}/${item._id}/edit`)
                                : setEditItem(item)
                            }
                            title={t("edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {can(resource as "cms", "delete") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(String(item._id))}
                            title={t("delete")}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-5 py-3">
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
        </div>
      </section>

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
