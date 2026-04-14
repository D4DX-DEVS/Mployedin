"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus, Edit2, Eye, Clock, CheckCircle, FileText, Trash2, Copy, Users, BriefcaseBusiness, ShieldCheck, Banknote, BookTemplate } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { useConfirm } from "@/hooks/useConfirm";
import { useJobs, useUpdateJobStatus, useCloneJob, useDeleteJob, useSaveAsTemplate, useJobTemplates, type Job } from "@/hooks/useJobs";
import { useDebounce } from "@/hooks/useDebounce";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
};

type PendingJobAction = "activate" | "deactivate" | "delete";

export default function EmployerJobsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cloningJobId, setCloningJobId] = useState<string | null>(null);
  const [pendingJobAction, setPendingJobAction] = useState<{ jobId: string; action: PendingJobAction } | null>(null);
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
  const saveAsTemplate = useSaveAsTemplate();
  const { data: jobTemplates = [] } = useJobTemplates();
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  const savedTemplateIds = new Set(
    jobTemplates.filter((t) => t.sourceJobId).map((t) => t.sourceJobId as string)
  );

  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const draftJobs = jobs.filter((job) => job.status === "draft").length;
  const hiddenSalaryJobs = jobs.filter((job) => job.showSalary === false).length;
  const totalOpenings = jobs.reduce((sum, job) => sum + (job.vacancies ?? 0), 0);

  async function handleCloneJob(job: Job) {
    setCloningJobId(job._id);
    const loadingToastId = toast.loading("Cloning job...");

    try {
      const data = await cloneJob.mutateAsync(job._id);
      const clonedJobId = data?.job?._id;

      if (!clonedJobId) {
        throw new Error("Failed to retrieve cloned job ID");
      }

      toast.success("Job cloned successfully", { id: loadingToastId });
      router.push(`/${locale}/employer/jobs/${clonedJobId}/edit`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to clone job", { id: loadingToastId });
    } finally {
      setCloningJobId(null);
    }
  }

  async function handleSaveAsTemplate(job: Job) {
    setSavingTemplateId(job._id);
    try {
      await saveAsTemplate.mutateAsync(job);
      toast.success(`"${job.title}" saved as template`);
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSavingTemplateId(null);
    }
  }

  async function handleActivateJob(job: Job) {
    setPendingJobAction({ jobId: job._id, action: "activate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success("Job activated successfully!");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to activate job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleDeactivateJob(job: Job) {
    const ok = await confirmDialog(
      "Deactivate this job? It will stop accepting new applications, but existing applications stay available."
    );
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "deactivate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "closed" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleDeleteJob(job: Job) {
    const prompt =
      job.status === "draft"
        ? "Delete this draft job? This cannot be undone."
        : "Permanently delete this job post? All associated data will be removed and this cannot be undone.";
    const ok = await confirmDialog(prompt);
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "delete" });

    try {
      await deleteJob.mutateAsync(job._id);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Active</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{activeJobs}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Drafts</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{draftJobs}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Salary Hidden</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{hiddenSalaryJobs}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
              <Banknote className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Openings</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{totalOpenings}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
        <Input
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 h-9"
        />
        <SearchableSelect
          className="w-full sm:w-44 h-9"
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "closed", label: "Closed" },
          ]}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="All statuses"
        />
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
            const isSalaryVisible = job.showSalary !== false && ((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0);
            const isActivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "activate";
            const isDeactivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "deactivate";
            const isDeleting = pendingJobAction?.jobId === job._id && pendingJobAction.action === "delete";
            return (
              <div key={job._id} className="card-base p-5 sm:p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
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
                      {isSalaryVisible && (
                        <><span className="text-border">·</span><span>{job.salary.min.toLocaleString()} – {job.salary.max.toLocaleString()} {job.salary.currency}</span></>
                      )}
                      {job.showSalary === false && (
                        <><span className="text-border">·</span><span>Salary not disclosed</span></>
                      )}
                      {job.vacancies != null && (
                        <><span className="text-border">·</span><span>{job.vacancies} opening{job.vacancies === 1 ? "" : "s"}</span></>
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

                  <div className="flex min-w-[220px] flex-col gap-2">
                    <Button size="sm" className="h-9 gap-2"
                      onClick={() => router.push(`/${locale}/employer/applications?jobId=${job._id}`)}>
                      <Users className="w-4 h-4" /> Applications
                    </Button>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" title="View job" className="h-9 gap-2"
                        onClick={() => router.push(`/${locale}/employer/jobs/${job._id}`)}>
                        <Eye className="w-4 h-4" /> View
                      </Button>
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title="Edit" className="h-9 gap-2"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/edit`)}>
                          <Edit2 className="w-4 h-4" /> Edit
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button size="sm" variant="outline" title="Clone" className="h-9 gap-2"
                          onClick={() => { void handleCloneJob(job); }}
                          disabled={cloningJobId === job._id}>
                          <Copy className="w-4 h-4" /> {cloningJobId === job._id ? "Cloning…" : "Clone"}
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button
                          size="sm"
                          variant="outline"
                          title={savedTemplateIds.has(job._id) ? "Already saved as template" : "Save as Template"}
                          className={`h-9 gap-2 ${
                            savedTemplateIds.has(job._id)
                              ? "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-50 cursor-default"
                              : ""
                          }`}
                          onClick={() => { if (!savedTemplateIds.has(job._id)) void handleSaveAsTemplate(job); }}
                          disabled={savingTemplateId === job._id || savedTemplateIds.has(job._id)}>
                          {savedTemplateIds.has(job._id) ? (
                            <><CheckCircle className="w-4 h-4" /> Saved</>
                          ) : savingTemplateId === job._id ? (
                            <><BookTemplate className="w-4 h-4" /> Saving…</>
                          ) : (
                            <><BookTemplate className="w-4 h-4" /> Template</>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {can("jobs", "update") && job.status === "draft" && (
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => { void handleActivateJob(job); }} disabled={isActivating}>
                        <CheckCircle className="w-3.5 h-3.5" /> {isActivating ? "Activating…" : "Activate"}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 border-orange-200 text-orange-700 hover:bg-orange-50" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="w-4 h-4" /> {isDeactivating ? "Deactivating…" : "Deactivate"}
                        </Button>
                      )}
                      {can("jobs", "delete") && (job.status === "draft" || job.status === "closed" || job.status === "expired") && (
                        <Button size="sm" variant="outline" title="Delete" className="h-9 gap-2 border-destructive/20 text-destructive hover:bg-destructive/5"
                          onClick={() => { void handleDeleteJob(job); }} disabled={isDeleting}>
                          <Trash2 className="w-4 h-4" /> {isDeleting ? "Deleting…" : "Delete"}
                        </Button>
                      )}
                    </div>
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
