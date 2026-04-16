"use client";

import { useState, useEffect, useCallback } from "react";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Inbox } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

export interface CmsColumn {
  key: string;
  label: string;
  render?: (value: unknown, item: Record<string, unknown>) => React.ReactNode;
}

interface CmsPageProps {
  /** API base URL e.g. "/api/admin/cms/faqs" */
  apiUrl: string;
  /** Page title */
  title: string;
  /** Arabic title */
  titleAr?: string;
  /** Description */
  description?: string;
  /** Table columns */
  columns: CmsColumn[];
  /** Fields for CrudModal */
  fields: CrudField[];
  /** Resource key for permissions */
  resource?: string;
  /** Whether to allow create/edit (default: true) */
  allowCreate?: boolean;
  /** Whether items have isActive field */
  hasStatusFilter?: boolean;
  /** Extra status filter options */
  statusFilterOptions?: { value: string; label: string }[];
}

export default function CmsPage({
  apiUrl,
  title,
  description,
  columns,
  fields,
  resource = "cms",
  allowCreate = true,
  hasStatusFilter = true,
  statusFilterOptions,
}: CmsPageProps) {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const r = await fetch(`${apiUrl}?${params}`);
      const d = await r.json();
      setItems(d.items ?? []);
      updateTotal(d.pagination?.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch CMS items:", err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, page, limit, search, statusFilter, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async (values: Record<string, string>) => {
    const payload: Record<string, unknown> = { ...values };
    // Convert boolean-like string values
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

  const defaultStatusOptions = statusFilterOptions || [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  return (
    <div className="page-container admin-cms-page-container space-y-6" data-admin-workspace="cms-page">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              CMS workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{title}</h1>
            {description ? (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>

          {allowCreate && can(resource as "cms", "create") ? (
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[220px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Content actions</p>
              <p className="mt-1 text-sm text-muted-foreground">Create a new item without losing your current filters.</p>
              <Button onClick={() => setShowAdd(true)} className="mt-4 h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" /> Add New
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse content</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Search and filter CMS records</h2>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
            />
          </div>
          {hasStatusFilter && (
            <SearchableSelect
              className="h-11 w-full rounded-xl border-border bg-secondary/65 sm:w-[160px]"
              options={defaultStatusOptions}
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
            />
          )}
        </div>
      </section>

      {/* Table */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Manage CMS records with consistent spacing</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            {total} items across {totalPages} page{totalPages === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/70 hover:bg-secondary/70">
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
                <TableHead className="w-[100px]">Actions</TableHead>
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
                  <TableCell colSpan={columns.length + 1} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="h-8 w-8" />
                      <p>No items found</p>
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
                            ? <Badge variant={item[col.key] ? "default" : "secondary"}>{item[col.key] ? "Active" : "Inactive"}</Badge>
                            : <span className="line-clamp-1 max-w-xs">{String(item[col.key] ?? "")}</span>
                        }
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {allowCreate && can(resource as "cms", "update") && (
                          <Button variant="ghost" size="icon" onClick={() => setEditItem(item)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {can(resource as "cms", "delete") && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(String(item._id))} title="Delete" className="text-destructive hover:text-destructive">
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

        <div className="mt-4">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(v) => { setLimit(v); resetPage(); }}
          />
        </div>
      </section>

      {/* Create Modal */}
      {showAdd && (
        <CrudModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          title={`Add ${title}`}
          fields={fields}
          onSubmit={handleCreate}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <CrudModal
          open={!!editItem}
          onClose={() => setEditItem(null)}
          title={`Edit ${title}`}
          fields={fields}
          initialValues={toStringRecord(editItem)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}
