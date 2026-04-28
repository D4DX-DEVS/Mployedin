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

const CREATE_FIELDS: CrudField[] = [
  { name: "name", label: "Name (English)", type: "text", required: true, placeholder: "e.g. Full-Time" },
  { name: "nameAr", label: "Name (Arabic)", type: "text", placeholder: "e.g. دوام كامل" },
  { name: "slug", label: "Slug", type: "text", placeholder: "auto-generated from name if empty" },
  { name: "sortOrder", label: "Sort Order", type: "number", placeholder: "0" },
  {
    name: "isActive",
    label: "Status",
    type: "select",
    options: [
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
  },
];

export default function JobAttributePage({ category, title, titleAr, description }: JobAttributePageProps) {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
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
    const ok = await confirmDialog("Are you sure you want to delete this item?");
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
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${category}-search`}
                placeholder={`Search ${title.toLowerCase()}…`}
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
              Filter
              {hasActiveFilters && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">!</span>}
            </Button>
            {can("job_attributes", "create") && (
              <Button
                onClick={() => setShowAdd(true)}
                size="sm"
                className="h-9 gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add New
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-secondary/30 px-5 py-3">
            <label htmlFor={`${category}-status`} className="text-xs font-medium text-muted-foreground">Status</label>
            <SearchableSelect
              id={`${category}-status`}
              className="h-8 w-[140px] rounded-lg border-border bg-card text-sm"
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
              placeholder="Status"
            />
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setStatusFilter("all"); resetPage(); }}
                className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>Name</TableHead>
                <TableHead>Name (Arabic)</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="w-[80px]">Order</TableHead>
                <TableHead>Status</TableHead>
                {(can("job_attributes", "update") || can("job_attributes", "delete")) && (
                  <TableHead className="text-right">Actions</TableHead>
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
                      <p className="text-sm font-medium text-foreground">No {title.toLowerCase()} found</p>
                      <p className="text-xs text-muted-foreground">Adjust the filters or add a new entry.</p>
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
                            <Button variant="ghost" size="xs" onClick={() => setEditItem(item)} title="Edit" aria-label={`Edit ${item.name}`}>
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          {can("job_attributes", "delete") && (
                            <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title="Delete" aria-label={`Delete ${item.name}`}>
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
        title={`Add ${title.replace(/s$/, "")}`}
        fields={CREATE_FIELDS}
        onSubmit={handleCreate}
      />

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={`Edit ${title.replace(/s$/, "")}`}
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
