"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Filter, Loader2, CheckCircle2, Clock, AlertCircle, Pencil, Trash2, Inbox } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";

interface Placement {
  _id: string;
  startDate: string;
  salary: number;
  currency: string;
  visaStatus: "not_required" | "pending" | "approved" | "rejected" | "stamped";
  commissionPaid: boolean;
  jobSeeker?: { name: string; email: string };
  employer?: { companyName: string };
  job?: { title: string };
  agent?: { name: string };
  superAgent?: { name: string };
  createdAt: string;
}

const VISA_ICONS: Record<string, React.ReactNode> = {
  stamped: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />,
  pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  rejected: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
  not_required: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />,
};

export default function AdminPlacementsPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [editItem, setEditItem] = useState<Placement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (visaFilter) params.set("visaStatus", visaFilter);
      if (commissionFilter) params.set("commissionPaid", commissionFilter);

      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.placements ?? []);
        updateTotal(data.total ?? 0);
        setTotalValue(data.totalSalaryValue ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, visaFilter, commissionFilter, limit]);

  useEffect(() => { load(); }, [load]);

  const markCommission = async (id: string, paid: boolean) => {
    await fetch(`/api/placements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPaid: paid }),
    });
    load();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/placements/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, salary: values.salary ? Number(values.salary) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Delete this placement?");
    if (!ok) return;
    await fetch(`/api/placements/${id}`, { method: "DELETE" });
    load();
  };

  const EDIT_FIELDS: CrudField[] = [
    { name: "salary", label: "Salary", type: "number" },
    { name: "currency", label: "Currency", type: "select", options: [
      { value: "AED", label: "AED" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "SAR", label: "SAR" }
    ]},
    { name: "visaStatus", label: "Visa Status", type: "select", options: [
      { value: "not_required", label: "Not Required" }, { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "stamped", label: "Stamped" }
    ]},
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const pendingVisa = placements.filter(p => p.visaStatus === "pending").length;
  const unpaidCommissions = placements.filter(p => !p.commissionPaid).length;

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHeader title="Placement Tracking"description={`${total} placements · Total salary value: ${totalValue.toLocaleString()} AED`} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "text-foreground" },
          { label: "Pending Visa", value: pendingVisa, color: "text-amber-600" },
          { label: "Unpaid Commission", value: unpaidCommissions, color: "text-red-500" },
          { label: "Total AED Value", value: `${(totalValue / 1000).toFixed(0)}K`, color: "text-primary" },
        ].map((s, i) => (
          <div key={i} className="card-base text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card-base flex flex-wrap gap-3 items-center">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input placeholder="Search candidate or company…" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select value={visaFilter} onChange={e => { setVisaFilter(e.target.value); resetPage(); }} className="input-field">
            <option value="">All Visa Status</option>
            <option value="not_required">Not Required</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="stamped">Stamped</option>
          </select>
          <select value={commissionFilter} onChange={e => { setCommissionFilter(e.target.value); resetPage(); }} className="input-field">
            <option value="">All Commission</option>
            <option value="true">Paid</option>
            <option value="false">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        {loading ? (
          <>
            <div className="bg-muted/30 px-4 py-3 h-10 animate-pulse" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border-t px-4 py-3 h-14 animate-pulse" />
            ))}
          </>
        ) : placements.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            No placements found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {["Candidate", "Role", "Company", "Agent", "Salary", "Visa", "Commission", "Date", ""].map((h, i) => (
                  <TableHead key={i}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {placements.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    <p className="font-medium">{p.jobSeeker?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{p.jobSeeker?.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.job?.title ?? "—"}</TableCell>
                  <TableCell>{p.employer?.companyName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.agent?.name ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    {p.salary?.toLocaleString()} <span className="text-xs text-muted-foreground">{p.currency}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {VISA_ICONS[p.visaStatus]}
                      <span className="text-xs capitalize">{p.visaStatus?.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.commissionPaid ? "paid" : "pending"} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.startDate).toLocaleDateString("en-AE")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!p.commissionPaid && can("placements", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => markCommission(p._id, true)}
                          className="text-emerald-700 hover:bg-emerald-50">
                          Mark Paid
                        </Button>
                      )}
                      {can("placements", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(p)} className="text-blue-600 hover:bg-blue-50" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {can("placements", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(p._id)} className="text-red-600 hover:bg-red-50" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} className="pt-4 border-t mt-4" />
      </div>
    </div>
  );
}
