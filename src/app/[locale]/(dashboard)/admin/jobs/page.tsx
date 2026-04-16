"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Inbox, Sparkles, Briefcase, ShieldCheck, FileText } from "lucide-react";

interface Job {
  _id: string;
  title: string;
  employerId?: { companyName?: string };
  status: string;
  approvalStatus: string;
  category?: string;
  location?: string | { isRemote?: boolean; city?: string; country?: string };
  applicantsCount?: number;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
  { value: "expired", label: "Expired" },
];

const APPROVAL_OPTIONS = [
  { value: "all", label: "All approvals" },
  { value: "pending", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [approvalStatus, setApprovalStatus] = useState("all");
  const [pendingJobAction, setPendingJobAction] = useState<{ jobId: string; label: string } | null>(null);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (approvalStatus !== "all") params.set("approvalStatus", approvalStatus);

      const res = await fetch(`/api/admin/jobs?${params}`);
      if (!res.ok) {
        throw new Error("Failed to load jobs. Please try again.");
      }

      const data = await res.json();
      setJobs(data.items ?? []);
      updateTotal(data.total ?? data.totalCount ?? ((data.totalPages ?? 1) * limit));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load jobs. Please try again.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, status, approvalStatus, page, limit, updateTotal]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const updateJob = async (id: string, body: Record<string, string>) => {
    const actionLabel = body.approvalStatus === "approved"
      ? "Job approved"
      : body.approvalStatus === "rejected"
        ? "Job rejected"
        : body.status === "closed"
          ? "Job closed"
          : "Job updated";

    setPendingJobAction({ jobId: id, label: actionLabel });

    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Failed to update job. Please try again.`);
      }

      toast.success(actionLabel);
      await fetchJobs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update job. Please try again.");
    } finally {
      setPendingJobAction(null);
    }
  };

  const visibleJobs = jobs.length;
  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const pendingJobs = jobs.filter((job) => job.approvalStatus === "pending").length;
  const visibleApplicants = jobs.reduce((sum, job) => sum + (job.applicantsCount ?? 0), 0);

  return (
    <div className="page-container space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Recruitment control
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Platform Jobs
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review platform-wide roles, clear pending approvals, and close the loop on job health from one polished admin workspace.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[240px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()} total jobs</p>
            <p className="text-xs text-muted-foreground">Across {totalPages.toLocaleString()} page{totalPages === 1 ? "" : "s"} of the current platform query.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Visible jobs</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{visibleJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Records loaded on the current page.</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <Briefcase className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active roles</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-300">{activeJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Jobs currently live in this view.</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending review</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-500 dark:text-amber-300">{pendingJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Approvals waiting on this page.</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Applicants</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-violet-600 dark:text-violet-300">{visibleApplicants}</p>
                <p className="mt-1 text-xs text-muted-foreground">Combined applications across visible roles.</p>
              </div>
              <div className="workspace-tone-violet rounded-2xl p-2.5">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse roles</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter the jobs you want to review next</h2>
            <p className="mt-1 text-sm text-muted-foreground">Search by title or narrow by lifecycle and approval state without leaving the admin workspace.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="relative min-w-0">
            <label htmlFor="admin-jobs-search" className="sr-only">Search jobs</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-jobs-search"
              placeholder="Search jobs"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
            />
          </div>
          <div>
            <label htmlFor="admin-jobs-status-filter" className="sr-only">Filter jobs by status</label>
            <SearchableSelect
              id="admin-jobs-status-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={STATUS_OPTIONS}
              value={status}
              onValueChange={(value) => { setStatus(value); resetPage(); }}
              placeholder="All statuses"
            />
          </div>
          <div>
            <label htmlFor="admin-jobs-approval-filter" className="sr-only">Filter jobs by approval status</label>
            <SearchableSelect
              id="admin-jobs-approval-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={APPROVAL_OPTIONS}
              value={approvalStatus}
              onValueChange={(value) => { setApprovalStatus(value); resetPage(); }}
              placeholder="All approvals"
            />
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="workspace-panel-surface h-28 animate-pulse rounded-[28px]"
            />
          ))}
        </div>
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
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
                {jobs.map((job) => {
                  const isUpdating = pendingJobAction?.jobId === job._id;

                  return (
                    <TableRow key={job._id} className="border-border/70">
                      <TableCell className="max-w-[240px]">
                        <div>
                          <p className="truncate font-medium text-foreground">{job.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{job.category ?? "No category assigned"}</p>
                        </div>
                      </TableCell>
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
                        <div className="flex flex-wrap gap-1.5">
                          {job.approvalStatus === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={isUpdating}
                                onClick={() => updateJob(job._id, { approvalStatus: "approved", status: "active" })}
                                className="text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                              >
                                {isUpdating ? "Working..." : "Approve"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={isUpdating}
                                onClick={() => updateJob(job._id, { approvalStatus: "rejected" })}
                                className="text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                {isUpdating ? "Working..." : "Reject"}
                              </Button>
                            </>
                          )}
                          {job.status === "active" && (
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={isUpdating}
                              onClick={() => updateJob(job._id, { status: "closed" })}
                              className="border-border bg-card text-foreground hover:bg-secondary disabled:opacity-60"
                            >
                              {isUpdating ? pendingJobAction?.label ?? "Working..." : "Close"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {jobs.length === 0 && (
                  <TableRow className="border-border/70">
                    <TableCell colSpan={9} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="workspace-muted-pill rounded-[20px] p-3">
                          <Inbox className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">No jobs found</p>
                          <p className="mt-1 text-sm text-muted-foreground">Adjust the search or approval filters to widen the platform view.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-border/80 px-4 py-3 sm:px-5">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              className="text-muted-foreground"
            />
          </div>
        </section>
      )}
    </div>
  );
}
