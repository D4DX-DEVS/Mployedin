"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus, Edit2, Eye, BarChart2, Clock, CheckCircle, XCircle, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";

interface Job {
  _id: string;
  title: string;
  location: string;
  category: string;
  status: "draft" | "active" | "closed" | "expired";
  salary: { min: number; max: number; currency: string };
  requirements: { skills: string[] };
  "poster.approvalStatus": "pending" | "approved" | "rejected";
  createdAt: string;
  expiresAt?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
};

export default function EmployerJobsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const pagination = usePagination();
  const { can } = usePermissions();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      params.set("myJobs", "true");
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, pagination.page, pagination.limit]);

  useEffect(() => {
    document.title = "My Jobs · MPLOYEDIN";
  }, []);

  useEffect(() => {
    pagination.resetPage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(fetchJobs, 300);
    return () => clearTimeout(timer);
  }, [fetchJobs]);

  async function updateStatus(jobId: string, status: string) {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchJobs();
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="My Job Postings"
        description={`${pagination.total} total jobs`}
        actions={
          can("jobs", "create") ? (
            <Button size="sm" onClick={() => router.push(`/${locale}/employer/jobs/new`)}>
              <Plus className="w-4 h-4 me-2" /> Post a Job
            </Button>
          ) : null
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-60"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base h-20 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card-base text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No jobs found</h3>
          <p className="text-sm text-muted-foreground mb-4">Start by posting your first job</p>
          <Button size="sm" onClick={() => router.push(`/${locale}/employer/jobs/new`)}>
            Post a Job
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const expires = job.expiresAt ? new Date(job.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
            return (
              <div key={job._id} className="card-base hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold">{job.title}</h3>
                      <Badge className={STATUS_COLORS[job.status] ?? ""}>{job.status}</Badge>
                      {job["poster.approvalStatus"] === "pending" && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Pending Approval</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {job.location && <span>{job.location}</span>}
                      {job.category && <span>{job.category}</span>}
                      {job.salary?.min > 0 && (
                        <span>{job.salary.min.toLocaleString()} – {job.salary.max.toLocaleString()} {job.salary.currency}</span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Posted {posted}</span>
                      {expires && <span>Expires {expires}</span>}
                    </div>
                    {job.requirements?.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.requirements.skills.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="ghost" title="View applications"
                      onClick={() => router.push(`/${locale}/employer/applications?jobId=${job._id}`)}>
                      <BarChart2 className="w-4 h-4" />
                    </Button>
                    {can("jobs", "update") && (
                      <Button size="sm" variant="ghost" title="Edit"
                        onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/edit`)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    {can("jobs", "update") && job.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(job._id, "active")}>
                        <CheckCircle className="w-4 h-4 me-1.5 text-emerald-600" /> Activate
                      </Button>
                    )}
                    {can("jobs", "update") && job.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(job._id, "closed")}>
                        <XCircle className="w-4 h-4 me-1.5 text-destructive" /> Close
                      </Button>
                    )}
                    {can("jobs", "delete") && job.status === "draft" && (
                      <Button size="sm" variant="ghost" title="Delete" className="text-destructive"
                        onClick={async () => { if (confirm("Delete this draft?")) { await fetch(`/api/jobs/${job._id}`, { method: "DELETE" }); fetchJobs(); } }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
