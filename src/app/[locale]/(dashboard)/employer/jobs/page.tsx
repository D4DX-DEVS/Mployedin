"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus, Edit2, Eye, BarChart2, Clock, CheckCircle, XCircle, FileText, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { useConfirm } from "@/hooks/useConfirm";
import { useJobs, useUpdateJobStatus, useCloneJob, useDeleteJob, type Job } from "@/hooks/useJobs";
import { useDebounce } from "@/hooks/useDebounce";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
};

export default function EmployerJobsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, debouncedSearch]);

  useEffect(() => { document.title = "My Jobs · MPLOYEDIN"; }, []);

  // ── React Query ────────────────────────────────────────────────
  const { data, isLoading } = useJobs({
    page,
    limit,
    status: statusFilter,
    search: debouncedSearch,
    myJobs: true,
  });

  const jobs = data?.jobs ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const updateStatus = useUpdateJobStatus();
  const cloneJob = useCloneJob();
  const deleteJob = useDeleteJob();

  async function handleDeleteDraft(jobId: string) {
    const ok = await confirmDialog("Delete this draft?");
    if (!ok) return;
    deleteJob.mutate(jobId);
  }

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHeader
        title="My Job Postings"
        description={`${total} total jobs`}
        actions={
          can("jobs", "create") ? (
            <Button onClick={() => router.push(`/${locale}/employer/jobs/new`)} className="gap-2">
              <Plus className="w-4 h-4" /> Post a Job
            </Button>
          ) : null
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 h-9"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base p-4 sm:p-5 h-24 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card-base p-6 text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-base mb-1.5">No jobs found</h3>
          <p className="text-sm text-muted-foreground mb-5">Start by posting your first job opening</p>
          <Button onClick={() => router.push(`/${locale}/employer/jobs/new`)} className="gap-2">
            <Plus className="w-4 h-4" /> Post a Job
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const expires = job.expiresAt ? new Date(job.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
            return (
              <div key={job._id} className="card-base p-4 sm:p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="font-semibold text-[15px] text-foreground">{job.title}</h3>
                      <Badge className={`${STATUS_COLORS[job.status] ?? ""} border text-xs font-medium px-2 py-0.5`}>{job.status}</Badge>
                      {job["poster.approvalStatus"] === "pending" && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs font-medium px-2 py-0.5">Pending Approval</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mb-2">
                      {job.location && <span>{typeof job.location === "object" ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ")) : job.location}</span>}
                      {job.category && <><span className="text-border">·</span><span>{job.category}</span></>}
                      {job.salary?.min > 0 && (
                        <><span className="text-border">·</span><span>{job.salary.min.toLocaleString()} – {job.salary.max.toLocaleString()} {job.salary.currency}</span></>
                      )}
                      <><span className="text-border">·</span><span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Posted {posted}</span></>
                      {expires && <><span className="text-border">·</span><span>Expires {expires}</span></>}
                    </div>
                    {job.requirements?.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {job.requirements.skills.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="text-xs font-normal bg-muted/40">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                    <Button size="sm" variant="ghost" title="View job" className="h-8 w-8 p-0"
                      onClick={() => router.push(`/${locale}/employer/jobs/${job._id}`)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="View applications" className="h-8 w-8 p-0"
                      onClick={() => router.push(`/${locale}/employer/applications?jobId=${job._id}`)}>
                      <BarChart2 className="w-4 h-4" />
                    </Button>
                    {can("jobs", "update") && (
                      <Button size="sm" variant="ghost" title="Edit" className="h-8 w-8 p-0"
                        onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/edit`)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    {can("jobs", "create") && (
                      <Button size="sm" variant="ghost" title="Clone" className="h-8 w-8 p-0"
                        onClick={async () => {
                          cloneJob.mutate(job._id);
                        }}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    )}
                    {can("jobs", "update") && job.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => updateStatus.mutate({ jobId: job._id, status: "active" })}>
                        <CheckCircle className="w-3.5 h-3.5" /> Activate
                      </Button>
                    )}
                    {can("jobs", "update") && job.status === "active" && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/5" onClick={() => updateStatus.mutate({ jobId: job._id, status: "closed" })}>
                        <XCircle className="w-3.5 h-3.5" /> Close
                      </Button>
                    )}
                    {can("jobs", "delete") && job.status === "draft" && (
                      <Button size="sm" variant="ghost" title="Delete" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteDraft(job._id)}>
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
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
}
