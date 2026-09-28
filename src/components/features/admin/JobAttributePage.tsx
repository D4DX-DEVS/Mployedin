"use client";

import { useState, useEffect, useCallback } from "react";
import { PlatformDataTabs } from "@/components/features/admin/PlatformDataTabs";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
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
import { Plus, Pencil, Trash2, Inbox, ListTree } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";

interface AttributeItem {
  _id: string;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface JobAttributePageProps {
  category: string;
}

export default function JobAttributePage({ category }: JobAttributePageProps) {
  const t = useTranslations("adminJobAttributes");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  /* Heading copy is derived from the category rather than passed in per page.
     The five callers used to hand over title/titleAr/description/descriptionAr
     as literals, which meant each leaf route imported the whole of en.json and
     ar.json just to read two strings. "job-skills" -> "jobSkills". */
  const keyPrefix = category.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const displayTitle = t(`${keyPrefix}Title`);
  const displayDescription = t(`${keyPrefix}Description`);
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const CREATE_FIELDS: CrudField[] = [
    { name: "name", label: t("nameEnglish"), type: "text", required: true, placeholder: t("namePlaceholder") },
    { name: "nameAr", label: t("nameArabic"), type: "text", placeholder: t("nameArPlaceholder") },
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
  ];
  const [items, setItems] = useState<AttributeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "sortOrder", { allow: ["name", "nameAr", "slug", "sortOrder", "createdAt"] });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "asc", { allow: ["asc", "desc"] });
  const order = sortOrder === "desc" ? "desc" : "asc";
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<AttributeItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/job-attributes/${category}?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [category, search, statusFilter, sortBy, sortOrder, page, limit, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const sortOptions = [
    { value: "sortOrder", label: t("order") },
    { value: "name", label: t("nameEnglish") },
    { value: "nameAr", label: t("nameArabic") },
    { value: "slug", label: t("slug") },
    { value: "createdAt", label: t("createdAt") },
  ];
  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all";

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
    resetPage();
  };

  const handleCreate = async (values: Record<string, string>) => {
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    if (values.slug) body.slug = values.slug;
    const res = await fetch(`/api/admin/job-attributes/${category}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: CREATE_FIELDS });
    }
    fetchItems();
  };

  const handleEdit = async (values: Record<string, string>) => {
    if (!editItem) return;
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    if (values.slug) body.slug = values.slug;
    const res = await fetch(`/api/admin/job-attributes/${category}/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: CREATE_FIELDS });
    }
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("confirmDelete"));
    if (!ok) return;
    await fetch(`/api/admin/job-attributes/${category}/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const rowActionsFor = (item: AttributeItem): { quick: RowAction[]; menu: RowAction[] } => {
    // Edit is the everyday action: a labelled button. Delete stays in "…".
    const quick: RowAction[] = [];
    const menu: RowAction[] = [];
    if (can("job_attributes", "update")) {
      quick.push({
        key: "edit",
        label: t("edit"),
        icon: Pencil,
        iconOnly: true,
        onSelect: () => setEditItem(item),
      });
    }
    if (can("job_attributes", "delete")) {
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

      {/* Same shape as the employer listing pages: compact hero, then one
          panel holding search, table and pagination. These ten lookup routes
          used to render a bare <h1> inside the panel, which read as a different
          product from every other admin page. */}
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={ListTree}
        title={displayTitle}
        description={displayDescription}
        actions={
          can("job_attributes", "create") && (
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
          placeholder={`${t("search")} ${displayTitle.toLowerCase()}…`}
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
          options={sortOptions}
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
                <TableHead data-label={t("nameEnglish")}><SortableTableHeader label={t("nameEnglish")} active={sortBy === "name"} order={order} onClick={() => toggleSort("name")} /></TableHead>
                <TableHead data-label={t("nameArabic")}><SortableTableHeader label={t("nameArabic")} active={sortBy === "nameAr"} order={order} onClick={() => toggleSort("nameAr")} /></TableHead>
                <TableHead data-label={t("slug")}><SortableTableHeader label={t("slug")} active={sortBy === "slug"} order={order} onClick={() => toggleSort("slug")} /></TableHead>
                <TableHead className="w-[80px]" data-label={t("order")}><SortableTableHeader label={t("order")} active={sortBy === "sortOrder"} order={order} onClick={() => toggleSort("sortOrder")} /></TableHead>
                <TableHead data-label={t("status")}>{t("status")}</TableHead>
                {(can("job_attributes", "update") || can("job_attributes", "delete")) && (
                  <TableHead className="text-right" data-label={t("actions")}>{t("actions")}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-4 py-8 text-center sm:px-6 sm:py-12">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Inbox className="h-6 w-6 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">{t("noneFound", { title: displayTitle.toLowerCase() })}</p>
                      <p className="text-xs text-muted-foreground">{t("adjustFilters")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className="border-border/70">
                    <TableCell className="font-medium text-foreground min-w-0 truncate">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground min-w-0 truncate" dir="rtl">{item.nameAr || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground min-w-0 truncate">{item.slug}</TableCell>
                    <TableCell className="text-muted-foreground text-center">{item.sortOrder}</TableCell>
                    <TableCell className="text-center"><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>
                    {(can("job_attributes", "update") || can("job_attributes", "delete")) && (
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

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      <CrudModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t("addTitle", { title: displayTitle.replace(/s$/, "") })}
        fields={CREATE_FIELDS}
        onSubmit={handleCreate}
      />

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={t("editTitle", { title: displayTitle.replace(/s$/, "") })}
        fields={CREATE_FIELDS}
        initialValues={
          editItem
            ? {
              name: editItem.name ?? "",
              nameAr: editItem.nameAr ?? "",
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
