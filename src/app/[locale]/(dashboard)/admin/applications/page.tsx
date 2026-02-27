"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Pencil, Trash2, Search, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Application {
  _id: string;
  jobId?: { title?: string };
  jobSeekerId?: { fullName?: string; email?: string; userId?: { name?: string; email?: string } };
  status: string;
  createdAt: string;
}

const STATUSES = ["applied", "shortlisted", "interview_scheduled", "selected", "rejected"];

export default function AdminApplicationsPage() {
  const { can } = usePermissions();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const res = await fetch(`/api/applications?${params}`);
    if (res.ok) {
      const data = await res.json();
      setApplications(data.items ?? data.applications ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [search, status, page, limit]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const updateStatus = async (id: string, newStatus: string) => {
    await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchApplications();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to reject this application?")) return;
    await updateStatus(id, "rejected");
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Applications" description="View and manage all job applications across the platform" />

      <div className="flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input placeholder="Search applicant or job…" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="pl-9 h-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <div className="bg-muted/30 px-4 py-3 h-10 animate-pulse" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-t px-4 py-3 h-14 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Applicant</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                {(can("applications", "update") || can("applications", "delete")) && (
                  <TableHead>Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    No applications found
                  </TableCell>
                </TableRow>
              ) : applications.map((app) => (
                <TableRow key={app._id}>
                  <TableCell>
                    <div className="font-medium">{app.jobSeekerId?.fullName ?? app.jobSeekerId?.userId?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{app.jobSeekerId?.email ?? app.jobSeekerId?.userId?.email ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-foreground/80">{app.jobId?.title ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={app.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(app.createdAt).toLocaleDateString()}</TableCell>
                  {(can("applications", "update") || can("applications", "delete")) && (
                    <TableCell className="flex items-center gap-1">
                      {can("applications", "update") && app.status !== "selected" && app.status !== "rejected" && (
                        <select onChange={(e) => { if (e.target.value) updateStatus(app._id, e.target.value); e.target.value = ""; }}
                          className="text-xs border rounded px-1 py-0.5" defaultValue="">
                          <option value="" disabled>Change…</option>
                          {STATUSES.filter(s => s !== app.status).map(s => (
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          ))}
                        </select>
                      )}
                      {can("applications", "delete") && app.status !== "rejected" && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(app._id)} className="text-red-600 hover:bg-red-50" title="Reject">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
