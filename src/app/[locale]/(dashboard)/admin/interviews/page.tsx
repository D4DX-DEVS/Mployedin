"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Filter, Eye, CheckCircle, XCircle, Loader2, CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

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
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

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
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/interviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview Oversight"
        description={`${total} interviews across the platform`}
      />

      {/* Filters */}
      <div className="card-base flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search candidate or company…" className="input-field flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
      <div className="card-base overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading interviews…</span>
          </div>
        ) : interviews.length === 0 ? (
          <p className="text-center py-12 text-sm text-muted-foreground">No interviews found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Candidate</th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Company</th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Agent</th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left pb-2 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {interviews.map((iv) => (
                <tr key={iv._id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 pr-4">
                    <p className="font-medium">{iv.jobSeeker?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{iv.jobSeeker?.email}</p>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{iv.job?.title ?? "—"}</td>
                  <td className="py-3 pr-4">{iv.employer?.companyName ?? "—"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{iv.agent?.name ?? "—"}</td>
                  <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                    {new Date(iv.scheduledAt).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={iv.status} />
                  </td>
                  <td className="py-3 flex items-center gap-1">
                    {iv.meetLink && (
                      <a href={iv.meetLink} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded hover:bg-primary/10 text-primary" title="Join meeting">
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {iv.status === "scheduled" && (
                      <>
                        <button onClick={() => updateStatus(iv._id, "completed")}
                          className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600" title="Mark completed">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => updateStatus(iv._id, "cancelled")}
                          className="p-1.5 rounded hover:bg-red-100 text-red-600" title="Cancel">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <p className="text-xs text-muted-foreground">
              Page {page} of {Math.ceil(total / limit)} ({total} total)
            </p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="btn-outline text-xs disabled:opacity-40">Previous</button>
              <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}
                className="btn-outline text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
