"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Edit2, Copy, CheckCircle, XCircle, Clock, MapPin,
  Briefcase, DollarSign, Users, Eye, Calendar, Tag, Trash2,
  GitBranch, SlidersHorizontal, PauseCircle, PlayCircle, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JobWorkflowTab } from "@/components/features/employer/jobs/JobWorkflowTab";
import { JobMatchingWeightsTab } from "@/components/features/employer/jobs/JobMatchingWeightsTab";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { useJobDetail, useUpdateJobStatus, useCloneJob, useDeleteJob } from "@/hooks/useJobs";
import { useConfirm } from "@/hooks/useConfirm";
import SocialShare from "@/components/features/public/SocialShare";
import { useTranslations } from "next-intl";

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
  qualifications?: string[];
  responsibilities?: string[];
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
  paused: "bg-sky-100 text-sky-700 border-sky-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
  pending_approval: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function JobDetailPage() {
  const t = useTranslations("employerJobDetail");
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "overview";
  const { can } = usePermissions();
  const { data: job, isLoading: loading } = useJobDetail(id);
  const updateStatusMutation = useUpdateJobStatus();
  const cloneMutation = useCloneJob();
  const deleteMutation = useDeleteJob();
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  // Auto-open poster dialog from ?poster=1 (e.g. after job creation)
  useEffect(() => {
    if (searchParams.get("poster") === "1" && job) {
      setPosterOpen(true);
    }
  }, [searchParams, job]);

  async function updateStatus(status: string) {
    updateStatusMutation.mutate({ jobId: id, status });
  }

  async function handleDelete() {
    const ok = await confirmDialog(t("deleteConfirm"));
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
          <h2 className="text-lg font-semibold mb-2">{t("notFound")}</h2>
          <p className="text-sm text-muted-foreground mb-5">{t("notFoundDesc")}</p>
          <Button variant="outline" onClick={() => router.push(`/${locale}/employer/jobs`)}>
            <ArrowLeft className="w-4 h-4 me-2" /> {t("backToJobs")}
          </Button>
        </div>
      </div>
    );
  }

  const dateLocale = locale === "ar" ? "ar" : "en-US";
  const loc = typeof job.location === "string"
    ? job.location
    : job.location
      ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}${job.location.isRemote ? t("remoteSuffix") : ""}`
      : null;

  const posted = new Date(job.createdAt).toLocaleDateString(dateLocale, {
    month: "long", day: "numeric", year: "numeric",
  });
  const expires = job.expiresAt
    ? new Date(job.expiresAt).toLocaleDateString(dateLocale, { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Back + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/${locale}/employer/jobs`)}>
          <ArrowLeft className="w-4 h-4" /> {t("backToJobs")}
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/poster`)}>
            <ImageIcon className="w-3.5 h-3.5" /> {t("createPoster")}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={cloneJob} disabled={cloning}>
            <Copy className="w-3.5 h-3.5" /> {cloning ? t("cloning") : t("clone")}
          </Button>
          <SocialShare
            url={typeof window !== "undefined" ? `${window.location.origin}/${locale}/jobs/${id}` : ""}
            title={job.title}
            description={job.description?.slice(0, 120)}
          />
          {can("jobs", "update") && (
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => router.push(`/${locale}/employer/jobs/${id}/edit`)}>
              <Edit2 className="w-3.5 h-3.5" /> {t("edit")}
            </Button>
          )}
          {can("jobs", "update") && job.status === "draft" && (
            <Button size="sm" className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus("active")}>
              <CheckCircle className="w-3.5 h-3.5" /> {t("activate")}
            </Button>
          )}
          {can("jobs", "delete") && job.status === "draft" && (
            <Button size="sm" variant="outline" className="gap-1.5 h-9 border-destructive/20 text-destructive hover:bg-destructive/5"
              onClick={() => { void handleDelete(); }} disabled={deleting}>
              <Trash2 className="w-3.5 h-3.5" /> {deleting ? t("deleting") : t("deleteDraft")}
            </Button>
          )}
          {can("jobs", "update") && job.status === "active" && (
            <Button size="sm" variant="outline" className="gap-1.5 h-9 border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => updateStatus("paused")}>
              <PauseCircle className="w-3.5 h-3.5" /> {t("pause")}
            </Button>
          )}
          {can("jobs", "update") && job.status === "active" && (
            <Button size="sm" variant="destructive" className="gap-1.5 h-9" onClick={() => updateStatus("closed")}>
              <XCircle className="w-3.5 h-3.5" /> {t("closeJob")}
            </Button>
          )}
          {can("jobs", "update") && job.status === "paused" && (
            <Button size="sm" className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus("active")}>
              <PlayCircle className="w-3.5 h-3.5" /> {t("resume")}
            </Button>
          )}
          {can("jobs", "update") && job.status === "paused" && (
            <Button size="sm" variant="destructive" className="gap-1.5 h-9" onClick={() => updateStatus("closed")}>
              <XCircle className="w-3.5 h-3.5" /> {t("closeJob")}
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
                  <Calendar className="w-3.5 h-3.5 shrink-0" /> {t("posted", { date: posted })}
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
              <Users className="w-3 h-3" /> {t("vacancies")}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-4 gap-1">
            <div className="text-xl font-bold text-foreground">{job.views ?? 0}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="w-3 h-3" /> {t("views")}
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
              {job.salary?.isNegotiable && ` (${t("negotiable")})`}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-4 gap-1">
            <div className="text-base font-bold text-foreground leading-tight text-center">{expires ?? t("noExpiry")}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {t("expires")}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Overview / Workflow / Matching Weights */}
      <Tabs defaultValue={initialTab} className="space-y-5">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> {t("tabOverview")}
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5">
            <GitBranch className="w-3.5 h-3.5" /> {t("tabWorkflow")}
          </TabsTrigger>
          <TabsTrigger value="matching-weights" className="gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> {t("tabMatchingWeights")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
      {/* Description */}
      <div className="card-base p-5 sm:p-6">
        <h2 className="text-base font-semibold text-foreground mb-3">{t("jobDescription")}</h2>
        <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
          {job.description}
        </div>
      </div>

      {/* Responsibilities */}
      {job.responsibilities && job.responsibilities.length > 0 && (
        <div className="card-base p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground mb-3">{t("responsibilities")}</h2>
          <ul className="list-disc list-inside space-y-1.5 text-sm text-foreground/80">
            {job.responsibilities.map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Qualifications */}
      {job.qualifications && job.qualifications.length > 0 && (
        <div className="card-base p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground mb-3">{t("qualifications")}</h2>
          <ul className="list-disc list-inside space-y-1.5 text-sm text-foreground/80">
            {job.qualifications.map((q: string, i: number) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Requirements */}
      {job.requirements && (
        <div className="card-base p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">{t("requirements")}</h2>

          {job.requirements.skills && job.requirements.skills.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2.5">{t("skills")}</p>
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("experience")}</p>
                <p className="text-sm font-semibold text-foreground">
                  {t("yearsRange", { min: job.requirements.experienceMin ?? 0, max: job.requirements.experienceMax ?? 30 })}
                </p>
              </div>
            )}
            {job.requirements.education && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("educationLabel")}</p>
                <p className="text-sm font-semibold text-foreground">{job.requirements.education}</p>
              </div>
            )}
            {job.requirements.languages && job.requirements.languages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("languagesLabel")}</p>
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
            <Tag className="w-4 h-4 text-muted-foreground" /> {t("tags")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {job.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-medium">{tag}</Badge>
            ))}
          </div>
        </div>
      )}
        </TabsContent>

        <TabsContent value="workflow">
          <JobWorkflowTab jobId={id} />
        </TabsContent>

        <TabsContent value="matching-weights">
          <JobMatchingWeightsTab jobId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
