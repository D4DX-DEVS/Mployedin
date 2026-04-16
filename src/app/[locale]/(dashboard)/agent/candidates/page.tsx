"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  Inbox,
  Loader2,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useSearchParams, usePathname } from "next/navigation";

interface ApplicationItem {
  _id: string;
  status: string;
  aiMatchScore?: number;
  appliedAt?: string;
  createdAt: string;
  jobId?: {
    _id: string;
    title: string;
    location?: { city?: string; country?: string };
  };
  jobSeekerId?: {
    _id: string;
    userId?: { name?: string };
    skills?: string[];
    totalExperienceYears?: number;
  };
  otherApplicationsCount?: number;
}

const STATUS_OPTIONS = [
  "", "applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected",
];

export default function AgentCandidatesPage() {
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("jobId") ?? "";

  const pagination = usePagination();
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState(initialJobId);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (statusFilter) params.set("status", statusFilter);
      if (jobIdFilter) params.set("jobId", jobIdFilter);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications ?? []);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, jobIdFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadApplications, 300);
    return () => clearTimeout(t);
  }, [loadApplications]);

  useEffect(() => { pagination.resetPage(); }, [statusFilter, jobIdFilter]);

  const handleStatusUpdate = async (appId: string, newStatus: string) => {
    setUpdatingId(appId);
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await loadApplications();
    } finally {
      setUpdatingId(null);
    }
  };

  const matchScoreColor = (score?: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-500";
  };

  const shortlistedCount = applications.filter((app) => ["shortlisted", "interview_scheduled", "selected", "offer", "hired"].includes(app.status)).length;
  const interviewCount = applications.filter((app) => app.status === "interview_scheduled").length;
  const highMatchCount = applications.filter((app) => (app.aiMatchScore ?? 0) >= 80).length;

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Candidates Pipeline</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Review candidate flow across your managed roles, push strong applicants forward, and keep interview momentum visible in one queue.
            </p>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{pagination.total} applications</p>
            <p className="text-xs text-slate-500">Candidate activity across the jobs currently in your scope.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Shortlisted</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{shortlistedCount}</p>
                <p className="mt-1 text-xs text-slate-500">Candidates moved past the first screen.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600"><Users className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Interviews</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{interviewCount}</p>
                <p className="mt-1 text-xs text-slate-500">Applications already converted into scheduled conversations.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600"><CalendarCheck2 className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">High match</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{highMatchCount}</p>
                <p className="mt-1 text-xs text-slate-500">Profiles with AI match scores of 80% or higher.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600"><Star className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Job filter</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{jobIdFilter ? 1 : 0}</p>
                <p className="mt-1 text-xs text-slate-500">Whether this queue is narrowed to a single job.</p>
              </div>
              <div className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-600"><BriefcaseBusiness className="h-5 w-5" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter candidates</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Focus on the stage that needs action</h2>
          <p className="mt-1 text-sm text-slate-500">Switch between application states or clear the active job constraint when you want the full queue again.</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {jobIdFilter && (
            <Button variant="outline" size="sm" onClick={() => setJobIdFilter("")} className="h-10 rounded-xl border-sky-200 bg-sky-50 px-4 text-sky-700 hover:bg-sky-100">
              Clear job filter
            </Button>
          )}
          {STATUS_OPTIONS.map((status) => {
            const isSelected = statusFilter === status;

            return (
              <Button
                key={status || "all"}
                onClick={() => setStatusFilter(status)}
                variant="outline"
                size="sm"
                className={isSelected
                  ? "h-10 rounded-xl border-sky-200 bg-sky-50 px-4 text-sky-700 hover:bg-sky-100 capitalize"
                  : "h-10 rounded-xl border-slate-200 bg-slate-50 px-4 text-slate-600 hover:bg-white capitalize"
                }
              >
                {status || "All"}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Manage each candidate before the next handoff</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            <ArrowRight className="h-3.5 w-3.5 text-sky-600" />
            {pagination.total} applications across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
            </div>
          ) : applications.length === 0 ? (
            <div className="py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <Inbox className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-900">No candidates found</p>
                <p className="text-sm text-slate-500">Try another stage filter or clear the current job scope.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job Applied To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Match</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app._id} className="hover:bg-slate-50/70">
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-slate-950">{app.jobSeekerId?.userId?.name ?? "Unknown"}</p>
                        {app.jobSeekerId?.totalExperienceYears != null && (
                          <p className="text-xs text-slate-500">{app.jobSeekerId.totalExperienceYears}y exp</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{app.jobId?.title ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={app.status} /></TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 text-sm font-medium ${matchScoreColor(app.aiMatchScore)}`}>
                        <Star className="h-3.5 w-3.5" />
                        {app.aiMatchScore != null ? `${app.aiMatchScore}%` : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {app.status === "applied" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl text-xs"
                            disabled={updatingId === app._id}
                            onClick={() => handleStatusUpdate(app._id, "shortlisted")}
                          >
                            Shortlist
                          </Button>
                        )}
                        {(app.status === "applied" || app.status === "shortlisted") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl text-xs"
                            disabled={updatingId === app._id}
                            onClick={() => handleStatusUpdate(app._id, "interview_scheduled")}
                          >
                            Schedule
                          </Button>
                        )}
                        {app.status !== "rejected" && app.status !== "hired" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-xl text-xs text-rose-500 hover:text-rose-600"
                            disabled={updatingId === app._id}
                            onClick={() => handleStatusUpdate(app._id, "rejected")}
                            aria-label={`Reject application for ${app.jobSeekerId?.userId?.name ?? "candidate"}`}
                          >
                            Reject
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

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
