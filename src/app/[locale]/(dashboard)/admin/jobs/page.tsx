"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (approvalStatus) params.set("approvalStatus", approvalStatus);
    const res = await fetch(`/api/admin/jobs?${params}`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
    }
    setLoading(false);
  }, [search, status, approvalStatus, page]);

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
    <div className="p-6 space-y-6">
      <PageHeader title="Jobs Management" description="Manage all platform jobs, approvals, and status control" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search jobs…"
          className="h-9 rounded-lg border px-3 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All statuses</option>
          {["draft", "active", "paused", "closed", "expired"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={approvalStatus}
          onChange={(e) => { setApprovalStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All approval statuses</option>
          {["pending", "approved", "rejected"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <div className="card-base overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Employer</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3 text-right">Apps</th>
                  <th className="px-4 py-3">Posted</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job._id} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{job.title}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {job.employerId?.companyName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{job.category ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{job.location ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={job.approvalStatus} /></td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{job.applicantsCount ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {job.approvalStatus === "pending" && (
                          <>
                            <button
                              onClick={() => updateJob(job._id, { approvalStatus: "approved", status: "active" })}
                              className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
                              Approve
                            </button>
                            <button
                              onClick={() => updateJob(job._id, { approvalStatus: "rejected" })}
                              className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                              Reject
                            </button>
                          </>
                        )}
                        {job.status === "active" && (
                          <button
                            onClick={() => updateJob(job._id, { status: "closed" })}
                            className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-700 border hover:bg-gray-100">
                            Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No jobs found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-muted/40">
                Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-muted/40">
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
