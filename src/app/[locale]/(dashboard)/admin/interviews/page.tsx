"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Filter, Eye, CheckCircle, XCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Inbox } from "lucide-react";

interface Interview {
  _id: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  type: string;
  location?: string;
  meetLink?: string;
  jobSeeker?: { name: string; email: string };
  employer?: { companyName: string };
  job?: { title: string };
  agent?: { name: string };
}

export default function AdminInterviewOversightPage() {
  const { can } = usePermissions();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editItem, setEditItem] = useState<Interview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.interviews ?? []);
        updateTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, limit]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/interviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/interviews/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Cancel this interview?")) return;
    await fetch(`/api/interviews/${id}`, { method: "DELETE" });
    load();
  };

  const EDIT_FIELDS: CrudField[] = [
    { name: "type", label: "Type", type: "select", options: [
      { value: "video", label: "Video" }, { value: "offline", label: "Offline" }, { value: "hybrid", label: "Hybrid" }
    ]},
    { name: "scheduledAt", label: "Scheduled At", type: "date" },
    { name: "duration", label: "Duration (min)", type: "select", options: [
      { value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "45", label: "45 min" }, { value: "60", label: "60 min" }
    ]},
    { name: "location", label: "Location", type: "text" },
    { name: "meetLink", label: "Meet Link", type: "text" },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Interview Oversight"
        description={`${total} interviews across the platform`}
      />

      {/* Filters */}
      <div className="card-base flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Search candidate or company…" className="input-field flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
            className="input-field">
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Candidate</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : interviews.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No interviews found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : interviews.map((iv) => (
              <TableRow key={iv._id}>
                <TableCell>
                  <p className="font-medium">{iv.jobSeeker?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{iv.jobSeeker?.email}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{iv.job?.title ?? "—"}</TableCell>
                <TableCell>{iv.employer?.companyName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{iv.agent?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Date(iv.scheduledAt).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" })}
                </TableCell>
                <TableCell>
                  <StatusBadge status={iv.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {iv.meetLink && (
                      <a href={iv.meetLink} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded hover:bg-primary/10 text-primary" title="Join meeting">
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {iv.status === "scheduled" && can("interviews", "update") && (
                      <>
                        <Button variant="ghost" size="xs" onClick={() => updateStatus(iv._id, "completed")} title="Mark completed">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => updateStatus(iv._id, "cancelled")} title="Cancel">
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                    {can("interviews", "update") && (
                      <Button variant="ghost" size="xs" onClick={() => setEditItem(iv)} title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                    {can("interviews", "delete") && iv.status === "scheduled" && (
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(iv._id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} className="pt-4 border-t mt-4" />
      </div>

      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Interview" fields={EDIT_FIELDS}
        initialValues={editItem ? { type: editItem.type, scheduledAt: editItem.scheduledAt?.slice(0, 10) ?? "", duration: "30", location: editItem.location ?? "", meetLink: editItem.meetLink ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
