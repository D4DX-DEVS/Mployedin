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
import { Plus, Pencil, Trash2, Search, Inbox, Sparkles, Map, Globe2, CheckCircle2, RotateCcw } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

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
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<StateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<StateItem | null>(null);

  // Country options for filters + modals
  const [countries, setCountries] = useState<CountryOption[]>([]);

  // Fetch countries for dropdowns
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
  }, [search, statusFilter, countryFilter, page, limit, updateTotal]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const activeItems = items.filter((item) => item.isActive).length;
  const representedCountries = new Set(
    items.map((item) => (typeof item.countryId === "object" && item.countryId !== null ? (item.countryId as CountryOption)._id : item.countryId)).filter(Boolean)
  ).size;
  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all" || countryFilter !== "all";

  // Build dynamic CrudModal fields with country options
  const getFields = useCallback((): CrudField[] => [
    { name: "name", label: "State Name (English)", type: "text", required: true, placeholder: "e.g. California" },
    { name: "nameAr", label: "State Name (Arabic)", type: "text", placeholder: "e.g. كاليفورنيا" },
    {
      name: "countryId",
      label: "Country",
      type: "select",
      required: true,
      options: countries.map((c) => ({ value: c._id, label: `${c.name} (${c.code})` })),
    },
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
  ], [countries]);

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
      const e = await res.json();
      throw new Error(e.error ?? "Failed to update");
    }
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Are you sure you want to delete this state?");
    if (!ok) return;
    await fetch(`/api/admin/location-data/states/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const getCountryName = (item: StateItem): string => {
    if (typeof item.countryId === "object" && item.countryId !== null) {
      return (item.countryId as CountryOption).name;
    }
    return "—";
  };

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />Location data</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">States</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Manage states and provinces for each country using the same modern admin shell as the rest of the refreshed workspace.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[240px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reference set</p><p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()} state records</p><p className="text-xs text-muted-foreground">Across {totalPages.toLocaleString()} page{totalPages === 1 ? "" : "s"} in the current state query.</p></div>{can("location_data", "create") && (<Button onClick={() => setShowAdd(true)} className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"><Plus className="h-4 w-4" /> Add New State</Button>)}</div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Visible</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{items.length}</p><p className="mt-1 text-xs text-muted-foreground">State records loaded on the current page.</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><Map className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeItems}</p><p className="mt-1 text-xs text-muted-foreground">Visible states currently enabled across admin forms.</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><CheckCircle2 className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Countries</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{representedCountries}</p><p className="mt-1 text-xs text-muted-foreground">Distinct countries represented in the current results.</p></div><div className="workspace-tone-indigo rounded-2xl p-2.5"><Globe2 className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Country filter</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{countryFilter === "all" ? "All" : "1"}</p><p className="mt-1 text-xs text-muted-foreground">Whether the current query is narrowed to a single country.</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><Globe2 className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse reference data</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter states by country, name, or status</h2><p className="mt-1 text-sm text-muted-foreground">Use the structured filters to narrow large location datasets without losing pagination context.</p></div>
        <div className="mt-5 grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_160px_auto]">
          <div><label htmlFor="admin-states-country" className="sr-only">Filter states by country</label><SearchableSelect id="admin-states-country" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={[{ value: "all", label: "All Countries" }, ...countries.map((c) => ({ value: c._id, label: c.name }))]} value={countryFilter} onValueChange={(v) => { setCountryFilter(v); resetPage(); }} placeholder="Select Country" /></div>
          <div className="relative min-w-0"><label htmlFor="admin-states-search" className="sr-only">Search states</label><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="admin-states-search" placeholder="Search states" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none" /></div>
          <div><label htmlFor="admin-states-status" className="sr-only">Filter states by status</label><SearchableSelect id="admin-states-status" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }} placeholder="Status" /></div>
          <Button type="button" variant="outline" onClick={() => { setCountryFilter("all"); setSearch(""); setStatusFilter("all"); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"><RotateCcw className="mr-2 h-4 w-4" /> Clear filters</Button>
        </div>
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">State registry</p><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-lg font-semibold text-foreground">Review and organize regional subdivisions</h3><p className="text-sm text-muted-foreground">Showing {items.length.toLocaleString()} record{items.length === 1 ? "" : "s"} on this page.</p></div></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72"><TableHead>Language</TableHead><TableHead>Country</TableHead><TableHead>State</TableHead><TableHead>Status</TableHead>{(can("location_data", "update") || can("location_data", "delete")) && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (<TableRow key={i} className="border-border/70 hover:bg-transparent">{Array.from({ length: 5 }).map((_, j) => (<TableCell key={j}><div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" /></TableCell>))}</TableRow>))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent"><TableCell colSpan={5} className="px-6 py-14 text-center"><div className="flex flex-col items-center gap-3 text-center"><div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div><div><p className="text-sm font-semibold text-foreground">No states found</p><p className="mt-1 text-sm text-muted-foreground">Adjust the filters or add a new state to populate this table.</p></div></div></TableCell></TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className="border-border/70"><TableCell className="text-muted-foreground">en</TableCell><TableCell className="text-muted-foreground">{getCountryName(item)}</TableCell><TableCell className="font-medium text-foreground">{item.name}</TableCell><TableCell><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>{(can("location_data", "update") || can("location_data", "delete")) && <TableCell><div className="flex justify-end gap-1.5">{can("location_data", "update") && <Button variant="ghost" size="xs" onClick={() => setEditItem(item)} title="Edit" aria-label={`Edit ${item.name}`}><Pencil className="h-3.5 w-3.5 text-primary" /></Button>}{can("location_data", "delete") && <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title="Delete" aria-label={`Delete ${item.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}</div></TableCell>}</TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border/80 px-4 py-3 sm:px-5"><PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} /></div>
      </section>

      {/* Create Modal */}
      <CrudModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add New State"
        fields={getFields()}
        onSubmit={handleCreate}
      />

      {/* Edit Modal */}
      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit State"
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
