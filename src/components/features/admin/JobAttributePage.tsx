"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
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
  title: string;
  titleAr: string;
  description?: string;
}

export default function JobAttributePage({ category, title, titleAr, description }: JobAttributePageProps) {
  const t = useTranslations("adminJobAttributes");
  const locale = useLocale();
  const displayTitle = locale === "ar" ? titleAr : title;
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
    <div className="page-container space-y-4">
      {ConfirmDialogNode}

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* Compact header row */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{displayTitle}</h1>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${category}-search`}
                placeholder={`${t("search")} ${displayTitle.toLowerCase()}…`}
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="h-9 w-48 rounded-lg border-border bg-secondary/65 pl-8 text-sm shadow-none sm:w-56"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className={`h-9 gap-1.5 rounded-lg border-border px-3 text-sm font-medium ${showFilters ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-foreground hover:bg-secondary"}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("filter")}
              {hasActiveFilters && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">!</span>}
            </Button>
            {can("job_attributes", "create") && (
              <Button
                onClick={() => setShowAdd(true)}
                size="sm"
                className="h-9 gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-3.5 w-3.5" /> {t("addNew")}
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-secondary/30 px-5 py-3">
            <label htmlFor={`${category}-status`} className="text-xs font-medium text-muted-foreground">{t("status")}</label>
            <SearchableSelect
              id={`${category}-status`}
              className="h-8 w-[140px] rounded-lg border-border bg-card text-sm"
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
                className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> {t("clear")}
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>{t("nameEnglish")}</TableHead>
                <TableHead>{t("nameArabic")}</TableHead>
                <TableHead>{t("slug")}</TableHead>
                <TableHead className="w-[80px]">{t("order")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                {(can("job_attributes", "update") || can("job_attributes", "delete")) && (
                  <TableHead className="text-right">{t("actions")}</TableHead>
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
                  <TableCell colSpan={6} className="px-6 py-12 text-center">
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
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground" dir="rtl">{item.nameAr || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.slug}</TableCell>
                    <TableCell className="text-muted-foreground">{item.sortOrder}</TableCell>
                    <TableCell><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>
                    {(can("job_attributes", "update") || can("job_attributes", "delete")) && (
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          {can("job_attributes", "update") && (
                            <Button variant="ghost" size="xs" onClick={() => setEditItem(item)} title={t("edit")} aria-label={t("editItem", { name: item.name })}>
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          {can("job_attributes", "delete") && (
                            <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title={t("delete")} aria-label={t("deleteItem", { name: item.name })}>
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

        <div className="border-t border-border/80 px-5 py-3">
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
