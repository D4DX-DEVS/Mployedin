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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Inbox } from "lucide-react";

interface Employer {
  _id: string;
  name?: string;
  companyName: string;
  email?: string;
  contactEmail?: string;
  industry?: string;
  location?: string;
  phone?: string;
  status?: string;
  isActive?: boolean;
  createdAt: string;
}

const FIELDS: CrudField[] = [
  { name: "name", label: "Contact Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "password", label: "Password", type: "text", required: true, placeholder: "Min 8 characters" },
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "industry", label: "Industry", type: "text" },
  { name: "location", label: "Location", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
];
const EDIT_FIELDS: CrudField[] = FIELDS.filter(f => f.name !== "password");

export default function AdminEmployersPage() {
  const { can } = usePermissions();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Employer | null>(null);

  const fetchEmployers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/employers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEmployers(data.items ?? data.employers ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [search, page, limit]);

  useEffect(() => { fetchEmployers(); }, [fetchEmployers]);

  const handleCreate = async (values: Record<string, string>) => {
    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    fetchEmployers();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/employers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    fetchEmployers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this employer?")) return;
    await fetch(`/api/employers/${id}`, { method: "DELETE" });
    fetchEmployers();
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <PageHeader title="Employers" description="Manage all employer accounts and company profiles" />
        {can("employers", "create") && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus className="h-4 w-4" /> Add Employer
          </Button>
        )}
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Search employer\u2026"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          className="pl-9 h-9"
        />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {(can("employers", "update") || can("employers", "delete")) && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : employers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No employers found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : employers.map((emp) => (
              <TableRow key={emp._id}>
                <TableCell className="font-medium">{emp.companyName || emp.name}</TableCell>
                <TableCell className="text-muted-foreground">{emp.email ?? emp.contactEmail ?? "\u2014"}</TableCell>
                <TableCell className="text-muted-foreground">{emp.industry ?? "\u2014"}</TableCell>
                <TableCell><StatusBadge status={emp.status ?? (emp.isActive !== false ? "active" : "inactive")} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(emp.createdAt).toLocaleDateString()}</TableCell>
                {(can("employers", "update") || can("employers", "delete")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("employers", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(emp)} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("employers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(emp._id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title="Add Employer" fields={FIELDS} onSubmit={handleCreate} />
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Employer" fields={EDIT_FIELDS}
        initialValues={editItem ? { name: editItem.name ?? "", email: editItem.email ?? editItem.contactEmail ?? "", companyName: editItem.companyName ?? "", industry: editItem.industry ?? "", location: editItem.location ?? "", phone: editItem.phone ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
