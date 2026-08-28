"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
  const [showFilters, setShowFilters] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<AttributeItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
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
  }, [category, search, statusFilter, page, limit, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all";

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
      const e = await res.json();
      throw new Error(e.error ?? "Failed to create");
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
      const e = await res.json();
      throw new Error(e.error ?? "Failed to update");
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

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* Compact header row: mobile stacked, desktop row */}
        <div className="flex flex-col gap-3 border-b border-border/80 sm:flex-row sm:items-center sm:justify-between panel-head">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.625rem]">{displayTitle}</h1>
            {displayDescription && (
              <p className="hidden text-xs text-muted-foreground sm:mt-0.5 sm:block">{displayDescription}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${category}-search`}
                placeholder={`${t("search")} ${displayTitle.toLowerCase()}…`}
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
                {hasActiveFilters && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">!</span>}
              </Button>
              {can("job_attributes", "create") && (
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
            <label htmlFor={`${category}-status`} className="text-xs font-medium text-muted-foreground">{t("status")}</label>
            <SearchableSelect
              id={`${category}-status`}
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
                onClick={() => { setSearch(""); setStatusFilter("all"); resetPage(); }}
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
                <TableHead data-label={t("nameEnglish")}>{t("nameEnglish")}</TableHead>
                <TableHead data-label={t("nameArabic")}>{t("nameArabic")}</TableHead>
                <TableHead data-label={t("slug")}>{t("slug")}</TableHead>
                <TableHead className="w-[80px]" data-label={t("order")}>{t("order")}</TableHead>
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
                        <div className="flex justify-end gap-1">
                          {can("job_attributes", "update") && (
                            <Button variant="ghost" size="xs" onClick={() => setEditItem(item)} title={t("edit")} aria-label={t("editItem", { name: item.name })} className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          {can("job_attributes", "delete") && (
                            <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title={t("delete")} aria-label={t("deleteItem", { name: item.name })} className="h-8 w-8">
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
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      </section>

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
