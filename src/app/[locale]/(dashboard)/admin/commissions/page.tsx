"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Inbox } from "lucide-react";

interface Commission {
  _id: string;
  agentId?: { fullName?: string; _id?: string };
  amount: number;
  currency?: string;
  status: string;
  type?: string;
  rate?: number;
  notes?: string;
  createdAt: string;
}

const ADD_FIELDS: CrudField[] = [
  { name: "type", label: "Type", type: "select", required: true, options: [
    { value: "placement", label: "Placement" }, { value: "override", label: "Override" }, { value: "bonus", label: "Bonus" }
  ]},
  { name: "amount", label: "Amount", type: "number", required: true },
  { name: "currency", label: "Currency", type: "select", options: [
    { value: "AED", label: "AED" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "SAR", label: "SAR" }
  ]},
  { name: "rate", label: "Rate (%)", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function AdminCommissionsPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Commission | null>(null);

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    const res = await fetch(`/api/commissions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCommissions(data.items ?? data.commissions ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [status, page, limit]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const handleCreate = async (values: Record<string, string>) => {
    const res = await fetch("/api/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, amount: Number(values.amount), rate: values.rate ? Number(values.rate) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    fetchCommissions();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/commissions/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, amount: Number(values.amount), rate: values.rate ? Number(values.rate) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    fetchCommissions();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Delete this commission?");
    if (!ok) return;
    await fetch(`/api/commissions/${id}`, { method: "DELETE" });
    fetchCommissions();
  };

  const updateStatus = async (id: string, newStatus: string) => {
    await fetch(`/api/commissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchCommissions();
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <div className="flex items-center justify-between">
        <PageHeader title="Commissions" description="Track and manage agent commission records" />
        {can("commissions", "create") && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus className="h-4 w-4" /> Add Commission
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Agent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
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
            ) : commissions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No commissions found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id}>
                <TableCell className="font-medium">{c.agentId?.fullName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.type ?? "placement"}</TableCell>
                <TableCell className="font-semibold">{c.currency ?? "USD"} {c.amount.toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {can("commissions", "approve") && c.status === "pending" && (
                      <button onClick={() => updateStatus(c._id, "approved")}
                        className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-200">Approve</button>
                    )}
                    {can("commissions", "approve") && c.status === "approved" && (
                      <button onClick={() => updateStatus(c._id, "paid")}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-200">Mark Paid</button>
                    )}
                    {can("commissions", "update") && (
                      <Button variant="ghost" size="xs" onClick={() => setEditItem(c)} title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                    {can("commissions", "delete") && (
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(c._id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title="Add Commission" fields={ADD_FIELDS} onSubmit={handleCreate} />
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Commission" fields={ADD_FIELDS}
        initialValues={editItem ? { type: editItem.type ?? "placement", amount: String(editItem.amount), currency: editItem.currency ?? "AED", rate: String(editItem.rate ?? ""), notes: editItem.notes ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
