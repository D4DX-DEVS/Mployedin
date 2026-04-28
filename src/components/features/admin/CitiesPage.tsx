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

interface CountryOption {
  _id: string;
  name: string;
  code: string;
}

interface StateOption {
  _id: string;
  name: string;
  countryId: CountryOption | string;
}

interface CityItem {
  _id: string;
  name: string;
  nameAr: string;
  slug: string;
  stateId: StateOption | string;
  sortOrder: number;
  isActive: boolean;
}

export default function CitiesPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [items, setItems] = useState<CityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<CityItem | null>(null);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [allStates, setAllStates] = useState<StateOption[]>([]);
  const [filteredStates, setFilteredStates] = useState<StateOption[]>([]);
  const [modalCountryId, setModalCountryId] = useState<string>("");
  const [modalStates, setModalStates] = useState<StateOption[]>([]);

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

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "500", status: "active" });
        if (countryFilter && countryFilter !== "all") params.set("countryId", countryFilter);
        const res = await fetch(`/api/admin/location-data/states?${params}`);
        if (res.ok) {
          const data = await res.json();
          const states = data.items ?? [];
          if (countryFilter === "all") setAllStates(states);
          setFilteredStates(states);
          setStateFilter("all");
        }
      } catch { /* ignore */ }
    })();
  }, [countryFilter]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/location-data/states?limit=500&status=active");
        if (res.ok) {
          const data = await res.json();
          setAllStates(data.items ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!modalCountryId) {
      setModalStates(allStates);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/admin/location-data/states?limit=500&status=active&countryId=${modalCountryId}`);
        if (res.ok) {
          const data = await res.json();
          setModalStates(data.items ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [modalCountryId, allStates]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (stateFilter && stateFilter !== "all") params.set("stateId", stateFilter);
      const res = await fetch(`/api/admin/location-data/cities?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [search, statusFilter, stateFilter, page, limit, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all" || countryFilter !== "all" || stateFilter !== "all";

  const getFields = useCallback((): CrudField[] => [
    { name: "name", label: "City Name (English)", type: "text", required: true, placeholder: "e.g. New York" },
    { name: "nameAr", label: "City Name (Arabic)", type: "text", placeholder: "e.g. نيويورك" },
    {
      name: "stateId",
      label: "State",
      type: "select",
      required: true,
      options: (modalStates.length > 0 ? modalStates : allStates).map((s) => {
        const countryName = typeof s.countryId === "object" && s.countryId !== null
          ? (s.countryId as CountryOption).name
          : "";
        return { value: s._id, label: countryName ? `${s.name} - ${countryName}` : s.name };
      }),
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
  ], [modalStates, allStates]);

  const handleCreate = async (values: Record<string, string>) => {
    const body: Record<string, unknown> = {
      name: values.name,
      nameAr: values.nameAr || "",
      stateId: values.stateId,
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    if (values.slug) body.slug = values.slug;
    const res = await fetch("/api/admin/location-data/cities", {
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
      stateId: values.stateId,
      sortOrder: values.sortOrder ? parseInt(values.sortOrder) : 0,
      isActive: values.isActive !== "false",
    };
    if (values.slug) body.slug = values.slug;
    const res = await fetch(`/api/admin/location-data/cities/${editItem._id}`, {
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
    const ok = await confirmDialog("Are you sure you want to delete this city?");
    if (!ok) return;
    await fetch(`/api/admin/location-data/cities/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const getStateName = (item: CityItem): string => {
    if (typeof item.stateId === "object" && item.stateId !== null) {
      const state = item.stateId as StateOption;
      const countryName = typeof state.countryId === "object" && state.countryId !== null
        ? (state.countryId as CountryOption).name
        : "";
      return countryName ? `${state.name} - ${countryName}` : state.name;
    }
    return "—";
  };

  return (
    <div className="page-container space-y-4">
      {ConfirmDialogNode}

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* Compact header row */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Cities</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage cities for each state or province.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-cities-search"
                placeholder="Search cities…"
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
            {can("location_data", "create") && (
              <Button
                onClick={() => { setModalCountryId(""); setShowAdd(true); }}
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
            <label className="text-xs font-medium text-muted-foreground">Country</label>
            <SearchableSelect
              id="admin-cities-country"
              className="h-8 w-[160px] rounded-lg border-border bg-card text-sm"
              options={[{ value: "all", label: "All Countries" }, ...countries.map((c) => ({ value: c._id, label: c.name }))]}
              value={countryFilter}
              onValueChange={(v) => { setCountryFilter(v); setStateFilter("all"); resetPage(); }}
              placeholder="All Countries"
            />
            <label className="text-xs font-medium text-muted-foreground">State</label>
            <SearchableSelect
              id="admin-cities-state"
              className="h-8 w-[160px] rounded-lg border-border bg-card text-sm"
              options={[{ value: "all", label: "All States" }, ...filteredStates.map((s) => ({ value: s._id, label: s.name }))]}
              value={stateFilter}
              onValueChange={(v) => { setStateFilter(v); resetPage(); }}
              placeholder="All States"
            />
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <SearchableSelect
              id="admin-cities-status"
              className="h-8 w-[120px] rounded-lg border-border bg-card text-sm"
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
                onClick={() => { setCountryFilter("all"); setStateFilter("all"); setSearch(""); setStatusFilter("all"); resetPage(); }}
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
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Status</TableHead>
                {(can("location_data", "update") || can("location_data", "delete")) && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="h-6 w-6 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">No cities found</p>
                      <p className="text-xs text-muted-foreground">Adjust the filters or add a new city.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className="border-border/70">
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{getStateName(item)}</TableCell>
                    <TableCell><StatusBadge status={item.isActive ? "active" : "inactive"} /></TableCell>
                    {(can("location_data", "update") || can("location_data", "delete")) && (
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          {can("location_data", "update") && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                if (typeof item.stateId === "object" && item.stateId !== null) {
                                  const state = item.stateId as StateOption;
                                  const cId = typeof state.countryId === "object" && state.countryId !== null
                                    ? (state.countryId as CountryOption)._id
                                    : "";
                                  setModalCountryId(cId);
                                }
                                setEditItem(item);
                              }}
                              title="Edit"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          {can("location_data", "delete") && (
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
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>

      <CrudModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add New City"
        fields={getFields()}
        onSubmit={handleCreate}
      />

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit City"
        fields={getFields()}
        initialValues={
          editItem
            ? {
                name: editItem.name ?? "",
                nameAr: editItem.nameAr ?? "",
                stateId: typeof editItem.stateId === "object"
                  ? (editItem.stateId as StateOption)._id
                  : (editItem.stateId as string) ?? "",
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
