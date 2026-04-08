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
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader
          title="Country Details"
          description="Manage countries with phone codes, currencies and formatting"
        />
        {can("location_data", "create") && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add New
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Search countries…"
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
              <TableHead>Country</TableHead>
              <TableHead>Short Name</TableHead>
              <TableHead>Phone Code</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Thousand Separator</TableHead>
              <TableHead>Decimal Separator</TableHead>
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
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No countries found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.code}</TableCell>
                  <TableCell className="text-muted-foreground">{item.phoneCode || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{item.currency || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{item.currencyCode || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{item.currencySymbol || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{item.thousandSeparator || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{item.decimalSeparator || "—"}</TableCell>
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
                            onClick={() => setEditItem(item)}
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
