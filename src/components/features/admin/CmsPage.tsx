"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableToolbar } from "@/components/shared/TableToolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Inbox, RotateCcw } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

export interface CmsColumn {
  key: string;
  label: string;
  render?: (value: unknown, item: Record<string, unknown>) => React.ReactNode;
}

interface CmsPageProps {
  apiUrl: string;
  title: string;
  titleAr?: string;
  description?: string;
  columns: CmsColumn[];
  fields: CrudField[];
  resource?: string;
  allowCreate?: boolean;
  hasStatusFilter?: boolean;
  statusFilterOptions?: { value: string; label: string }[];
  editPageBasePath?: string;
  createPagePath?: string;
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
  editPageBasePath,
  createPagePath,
}: CmsPageProps) {
  const { can } = usePermissions();
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
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

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all";

  return (
    <div className="page-container admin-cms-page-container space-y-4" data-admin-workspace="cms-page">
      {ConfirmDialogNode}

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <TableToolbar
          title={title}
          description={description}
          search={search}
          onSearchChange={(value) => { setSearch(value); resetPage(); }}
          actions={allowCreate && can(resource as "cms", "create") ? (
            <Button
              onClick={() => createPagePath ? router.push(`/${locale}${createPagePath}`) : setShowAdd(true)}
              size="sm"
              className="h-9 gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add New
            </Button>
          ) : undefined}
          filterContent={hasStatusFilter ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <SearchableSelect
                className="h-8 w-[140px] rounded-lg border-border bg-card text-sm"
                options={defaultStatusOptions}
                value={statusFilter}
                onValueChange={(value) => { setStatusFilter(value); resetPage(); }}
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
          ) : undefined}
          hasActiveFilters={hasActiveFilters}
          className="rounded-none border-0 bg-transparent shadow-none"
        />

        {/* Table */}
        <div className="overflow-x-auto">
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
                  <TableCell colSpan={columns.length + 1} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="h-6 w-6 opacity-50" />
                      <p className="text-sm font-medium text-foreground">No items found</p>
                      <p className="text-xs">Adjust the filters or add a new entry.</p>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              editPageBasePath
                                ? router.push(`/${locale}${editPageBasePath}/${item._id}/edit`)
                                : setEditItem(item)
                            }
                            title="Edit"
                          >
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

        <div className="border-t border-border/80 px-5 py-3">
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

      {showAdd && (
        <CrudModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          title={`Add ${title}`}
          fields={fields}
          onSubmit={handleCreate}
        />
      )}

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
