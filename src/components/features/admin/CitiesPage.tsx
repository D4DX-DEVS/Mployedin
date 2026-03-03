"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Inbox } from "lucide-react";

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
  const [items, setItems] = useState<CityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<CityItem | null>(null);

  // Dropdown data
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [allStates, setAllStates] = useState<StateOption[]>([]);
  const [filteredStates, setFilteredStates] = useState<StateOption[]>([]);

  // Modal state (for cascading country→state in modal)
  const [modalCountryId, setModalCountryId] = useState<string>("");
  const [modalStates, setModalStates] = useState<StateOption[]>([]);

  // Fetch countries
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

  // Fetch states when country filter changes
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "500", status: "active" });
        if (countryFilter && countryFilter !== "all") params.set("countryId", countryFilter);
        const res = await fetch(`/api/admin/location-data/states?${params}`);
        if (res.ok) {
          const data = await res.json();
          const states = data.items ?? [];
          if (countryFilter === "all") {
            setAllStates(states);
          }
          setFilteredStates(states);
          setStateFilter("all");
        }
      } catch { /* ignore */ }
    })();
  }, [countryFilter]);

  // Initial fetch all states for modals
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

  // Fetch modal states when modal country changes
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

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Build dynamic fields — Note: CrudModal doesn't support cascading, so we use
  // a two-step approach: Country select (for filtering) + State select with filtered options
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
        return {
          value: s._id,
          label: countryName ? `${s.name} - ${countryName}` : s.name,
        };
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
    if (!confirm("Are you sure you want to delete this city?")) return;
    await fetch(`/api/admin/location-data/cities/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const getStateName = (item: CityItem): string => {
    if (typeof item.stateId === "object" && item.stateId !== null) {
      const state = item.stateId as StateOption;
      const countryName =
        typeof state.countryId === "object" && state.countryId !== null
          ? (state.countryId as CountryOption).name
          : "";
      return countryName ? `${state.name} - ${countryName}` : state.name;
    }
    return "—";
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader
          title="Cities"
          description="Manage cities for each state/province"
        />
        {can("location_data", "create") && (
          <Button onClick={() => { setModalCountryId(""); setShowAdd(true); }} size="sm" className="bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4 mr-1" /> Add New City
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={countryFilter}
          onValueChange={(v) => {
            setCountryFilter(v);
            setStateFilter("all");
            resetPage();
          }}
        >
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Select Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {countries.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={stateFilter}
          onValueChange={(v) => {
            setStateFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Select State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {filteredStates.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Search cities…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="pl-9 h-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Language</TableHead>
              <TableHead>State</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
              {(can("location_data", "update") || can("location_data", "delete")) && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No cities found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="text-muted-foreground">en</TableCell>
                  <TableCell className="text-muted-foreground">{getStateName(item)}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.isActive ? "active" : "inactive"} />
                  </TableCell>
                  {(can("location_data", "update") || can("location_data", "delete")) && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {can("location_data", "update") && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              // Set modal country for state filtering
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
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                        {can("location_data", "delete") && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleDelete(item._id)}
                            title="Delete"
                          >
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

      {/* Pagination */}
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      {/* Create Modal */}
      <CrudModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add New City"
        fields={getFields()}
        onSubmit={handleCreate}
      />

      {/* Edit Modal */}
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
