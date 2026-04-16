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
import { Plus, Pencil, Trash2, Search, Inbox, Sparkles, Globe2, Phone, Coins, RotateCcw } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

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

const CREATE_FIELDS: CrudField[] = [
  { name: "name", label: "Country Name (English)", type: "text", required: true, placeholder: "e.g. Afghanistan" },
  { name: "nameAr", label: "Country Name (Arabic)", type: "text", placeholder: "e.g. أفغانستان" },
  { name: "code", label: "Short Name (ISO Code)", type: "text", required: true, placeholder: "e.g. AF" },
  { name: "phoneCode", label: "Phone Code", type: "text", placeholder: "e.g. 93" },
  { name: "currency", label: "Currency", type: "text", placeholder: "e.g. Afghanis" },
  { name: "currencyCode", label: "Currency Code", type: "text", placeholder: "e.g. AFN" },
  { name: "currencySymbol", label: "Currency Symbol", type: "text", placeholder: "e.g. ؋" },
  { name: "thousandSeparator", label: "Thousand Separator", type: "text", placeholder: "e.g. ," },
  { name: "decimalSeparator", label: "Decimal Separator", type: "text", placeholder: "e.g. ." },
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

export default function CountriesPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<CountryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<CountryItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/location-data/countries?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      // silently fail — UI shows empty state
    }
    setLoading(false);
  }, [search, statusFilter, page, limit, updateTotal]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const activeItems = items.filter((item) => item.isActive).length;
  const uniqueCurrencies = new Set(items.map((item) => item.currencyCode || item.currency).filter(Boolean)).size;
  const phoneCodeItems = items.filter((item) => Boolean(item.phoneCode)).length;
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
      const e = await res.json();
      throw new Error(e.error ?? "Failed to update");
    }
    setEditItem(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Are you sure you want to delete this country?");
    if (!ok) return;
    await fetch(`/api/admin/location-data/countries/${id}`, { method: "DELETE" });
    fetchItems();
  };

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Location data
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Country Details</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Manage countries, phone codes, currency metadata, and numeric formatting from the modern admin location workspace.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[240px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reference set</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()} country records</p>
              <p className="text-xs text-muted-foreground">Across {totalPages.toLocaleString()} page{totalPages === 1 ? "" : "s"} in the current country query.</p>
            </div>
            {can("location_data", "create") && (
              <Button onClick={() => setShowAdd(true)} className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" /> Add New
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Visible</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{items.length}</p><p className="mt-1 text-xs text-muted-foreground">Country records loaded on the current page.</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><Globe2 className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeItems}</p><p className="mt-1 text-xs text-muted-foreground">Visible countries currently enabled in forms and filters.</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><Globe2 className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Phone codes</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{phoneCodeItems}</p><p className="mt-1 text-xs text-muted-foreground">Visible countries that already include phone metadata.</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><Phone className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Currencies</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{uniqueCurrencies}</p><p className="mt-1 text-xs text-muted-foreground">Distinct currency definitions visible in this query.</p></div><div className="workspace-tone-indigo rounded-2xl p-2.5"><Coins className="h-5 w-5" /></div></div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse reference data</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter countries by name or status</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search the country library and reset the view without leaving the location data workspace.</p>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid w-full gap-3 lg:max-w-[620px] lg:grid-cols-[minmax(0,1fr)_160px]">
            <div className="relative min-w-0">
              <label htmlFor="admin-countries-search" className="sr-only">Search countries</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="admin-countries-search" placeholder="Search countries" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none" />
            </div>
            <div>
              <label htmlFor="admin-countries-status" className="sr-only">Filter countries by status</label>
              <SearchableSelect id="admin-countries-status" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }} placeholder="Status" />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"><RotateCcw className="mr-2 h-4 w-4" /> Clear filters</Button>
        </div>
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Country registry</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-foreground">Review formatting and telecom metadata</h3>
            <p className="text-sm text-muted-foreground">Showing {items.length.toLocaleString()} record{items.length === 1 ? "" : "s"} on this page.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>Country</TableHead>
                <TableHead>Short Name</TableHead>
                <TableHead>Phone Code</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Thousand Separator</TableHead>
                <TableHead>Decimal Separator</TableHead>
                <TableHead>Status</TableHead>
                {(can("location_data", "update") || can("location_data", "delete")) && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={10} className="px-6 py-14 text-center"><div className="flex flex-col items-center gap-3 text-center"><div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div><div><p className="text-sm font-semibold text-foreground">No countries found</p><p className="mt-1 text-sm text-muted-foreground">Adjust the filters or add a new country to populate this reference table.</p></div></div></TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className="border-border/70">
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground">{item.phoneCode || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.currency || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.currencyCode || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.currencySymbol || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.thousandSeparator || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.decimalSeparator || "—"}</TableCell>
                    <TableCell><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>
                    {(can("location_data", "update") || can("location_data", "delete")) && (
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          {can("location_data", "update") && <Button variant="ghost" size="xs" onClick={() => setEditItem(item)} title="Edit" aria-label={`Edit ${item.name}`}><Pencil className="h-3.5 w-3.5 text-primary" /></Button>}
                          {can("location_data", "delete") && <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title="Delete" aria-label={`Delete ${item.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
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
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>

      {/* Create Modal */}
      <CrudModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Country"
        fields={CREATE_FIELDS}
        onSubmit={handleCreate}
      />

      {/* Edit Modal */}
      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit Country"
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
