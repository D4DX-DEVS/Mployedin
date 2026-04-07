"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Inbox } from "lucide-react";

interface Job {
  _id: string;
  title: string;
  employerId?: { companyName?: string };
  status: string;
  approvalStatus: string;
  category?: string;
  location?: string;
  applicantsCount?: number;
  createdAt: string;
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (approvalStatus) params.set("approvalStatus", approvalStatus);
    const res = await fetch(`/api/admin/jobs?${params}`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.items ?? []);
      updateTotal(data.total ?? data.totalCount ?? ((data.totalPages ?? 1) * limit));
    }
    setLoading(false);
  }, [search, status, approvalStatus, page, limit]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const updateJob = async (id: string, body: Record<string, string>) => {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchJobs();
  };

  return (
    <div className="page-container">
      <PageHeader title="Jobs Management" description="Manage all platform jobs, approvals, and status control" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input placeholder="Search jobs…" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="pl-9 h-9" />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All statuses</option>
          {["draft", "active", "paused", "closed", "expired"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={approvalStatus}
          onChange={(e) => { setApprovalStatus(e.target.value); resetPage(); }}
          className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All approval statuses</option>
          {["pending", "approved", "rejected"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
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
        <>
          <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Title</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead className="text-right">Apps</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{job.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.employerId?.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{job.category ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{typeof job.location === "object" && job.location ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ") || "—") : (job.location ?? "—")}</TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell><StatusBadge status={job.approvalStatus} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">{job.applicantsCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {job.approvalStatus === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => updateJob(job._id, { approvalStatus: "approved", status: "active" })}
                              className="text-green-700 hover:bg-green-50">
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => updateJob(job._id, { approvalStatus: "rejected" })}
                              className="text-red-700 hover:bg-red-50">
                              Reject
                            </Button>
                          </>
                        )}
                        {job.status === "active" && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => updateJob(job._id, { status: "closed" })}>
                            Close
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      No jobs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </>
      )}
    </div>
  );
}
