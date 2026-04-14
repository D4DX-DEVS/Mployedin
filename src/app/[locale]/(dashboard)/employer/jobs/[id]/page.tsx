"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Edit2, Copy, CheckCircle, XCircle, Clock, MapPin,
  Briefcase, DollarSign, Users, Eye, Calendar, Tag, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { useJobDetail, useUpdateJobStatus, useCloneJob, useDeleteJob } from "@/hooks/useJobs";
import { useConfirm } from "@/hooks/useConfirm";

interface Job {
  _id: string;
  title: string;
  description: string;
  category?: string;
  location?: { country?: string; city?: string; isRemote?: boolean } | string;
  requirements?: {
    skills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
    languages?: string[];
  };
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean };
  status: string;
  workflowMode?: string;
  vacancies?: number;
  views?: number;
  tags?: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  employerId?: { companyName?: string };
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
  pending_approval: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function JobDetailPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { can } = usePermissions();
  const { data: job, isLoading: loading } = useJobDetail(id);
  const updateStatusMutation = useUpdateJobStatus();
  const cloneMutation = useCloneJob();
  const deleteMutation = useDeleteJob();
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  async function updateStatus(status: string) {
    updateStatusMutation.mutate({ jobId: id, status });
  }

  async function handleDelete() {
    const ok = await confirmDialog("Delete this draft job? This cannot be undone.");
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(id);
      router.push(`/${locale}/employer/jobs`);
    } catch {
      setDeleting(false);
    }
  }

  async function cloneJob() {
    setCloning(true);
    try {
      const data = await cloneMutation.mutateAsync(id);
      router.push(`/${locale}/employer/jobs/${data.job._id}/edit`);
    } finally {
      setCloning(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-9 w-32 bg-muted animate-pulse rounded-lg" />
        <div className="card-base p-5 sm:p-6 h-52 animate-pulse bg-muted/40" />
        <div className="card-base p-5 sm:p-6 h-36 animate-pulse bg-muted/40" />
        <div className="card-base p-5 sm:p-6 h-28 animate-pulse bg-muted/40" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-container">
        <div className="card-base p-8 text-center py-20">
          <h2 className="text-lg font-semibold mb-2">Job not found</h2>
          <p className="text-sm text-muted-foreground mb-5">This job may have been removed.</p>
          <Button variant="outline" onClick={() => router.push(`/${locale}/employer/jobs`)}>
            <ArrowLeft className="w-4 h-4 me-2" /> Back to Jobs
          </Button>
        </div>
      </div>
    );
  }

  const loc = typeof job.location === "string"
    ? job.location
    : job.location
      ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}${job.location.isRemote ? " (Remote)" : ""}`
      : null;

  const posted = new Date(job.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const expires = job.expiresAt
    ? new Date(job.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Back + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/${locale}/employer/jobs`)}>
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={cloneJob} disabled={cloning}>
            <Copy className="w-3.5 h-3.5" /> {cloning ? "Cloning…" : "Clone"}
          </Button>
          {can("jobs", "update") && (
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => router.push(`/${locale}/employer/jobs/${id}/edit`)}>
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {can("jobs", "update") && job.status === "draft" && (
            <Button size="sm" className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus("active")}>
              <CheckCircle className="w-3.5 h-3.5" /> Activate
            </Button>
          )}
          {can("jobs", "delete") && job.status === "draft" && (
            <Button size="sm" variant="outline" className="gap-1.5 h-9 border-destructive/20 text-destructive hover:bg-destructive/5"
              onClick={() => { void handleDelete(); }} disabled={deleting}>
              <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting…" : "Delete Draft"}
            </Button>
          )}
          {can("jobs", "update") && job.status === "active" && (
            <Button size="sm" variant="destructive" className="gap-1.5 h-9" onClick={() => updateStatus("closed")}>
              <XCircle className="w-3.5 h-3.5" /> Close Job
            </Button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="card-base p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">{job.title}</h1>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {loc && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {loc}
                </span>
              )}
              {job.category && (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 shrink-0" /> {job.category}
                  </span>
                </>
              )}
              <>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" /> Posted {posted}
                </span>
              </>
            </div>
          </div>
          <Badge className={`${STATUS_COLORS[job.status] ?? ""} border text-xs font-semibold px-2.5 py-1 shrink-0`}>
            {job.status.replace("_", " ")}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/60 rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
          <div className="flex flex-col items-center justify-center p-2 sm:p-4 gap-1">
            <div className="text-xl font-bold text-foreground">{job.vacancies ?? 1}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> Vacancies
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-4 gap-1">
            <div className="text-xl font-bold text-foreground">{job.views ?? 0}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="w-3 h-3" /> Views
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-4 gap-1">
            <div className="text-xl font-bold text-foreground leading-tight">
              {job.salary?.min && job.salary?.max
                ? `${job.salary.min.toLocaleString()}–${job.salary.max.toLocaleString()}`
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> {job.salary?.currency ?? "USD"}
              {job.salary?.isNegotiable && " (Negotiable)"}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-4 gap-1">
            <div className="text-base font-bold text-foreground leading-tight text-center">{expires ?? "No expiry"}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Expires
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="card-base p-5 sm:p-6">
        <h2 className="text-base font-semibold text-foreground mb-3">Job Description</h2>
        <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
          {job.description}
        </div>
      </div>

      {/* Requirements */}
      {job.requirements && (
        <div className="card-base p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Requirements</h2>

          {job.requirements.skills && job.requirements.skills.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2.5">Skills</p>
              <div className="flex flex-wrap gap-2">
                {job.requirements.skills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs font-medium bg-primary/8 text-primary border-0 px-2.5 py-1">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            {(job.requirements.experienceMin !== undefined || job.requirements.experienceMax !== undefined) && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Experience</p>
                <p className="text-sm font-semibold text-foreground">
                  {job.requirements.experienceMin ?? 0}–{job.requirements.experienceMax ?? 30} years
                </p>
              </div>
            )}
            {job.requirements.education && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Education</p>
                <p className="text-sm font-semibold text-foreground">{job.requirements.education}</p>
              </div>
            )}
            {job.requirements.languages && job.requirements.languages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Languages</p>
                <p className="text-sm font-semibold text-foreground">{job.requirements.languages.join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="card-base p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" /> Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {job.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-xs font-medium">{t}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
