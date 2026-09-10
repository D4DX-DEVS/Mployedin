"use client";

import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, DollarSign, Users, Eye, Tag, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { useJobDetail } from "@/hooks/useJobs";
import Link from "next/link";
import { formatCount } from "@/lib/ui/intlFormat";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  paused: "bg-sky-100 text-sky-700 border-sky-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
};

export default function AgentJobDetailPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { data: job, isLoading: loading } = useJobDetail(id);
  const t = useTranslations("agentJobDetail");
  const tc = useTranslations("common");

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-9 w-32 bg-muted animate-pulse rounded-lg" />
        <div className="card-base h-52 animate-pulse bg-muted/40 panel-body" />
        <div className="card-base h-36 animate-pulse bg-muted/40 panel-body" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-container">
        <div className="card-base p-8 text-center py-20">
          <h2 className="heading-section font-semibold mb-2">{t("jobNotFound")}</h2>
          <p className="text-sm text-muted-foreground mb-5">{t("jobMayHaveBeenRemoved")}</p>
          <Button variant="outline" onClick={() => router.push(`/${locale}/agent/jobs`)}>
            <ArrowLeft className="w-4 h-4 me-2" /> {t("backToJobs")}
          </Button>
        </div>
      </div>
    );
  }

  const loc = typeof job.location === "string"
    ? job.location
    : job.location
      ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}${job.location.isRemote ? ` (${t("remote")})` : ""}`
      : null;

  const posted = new Date(job.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const expires = job.expiresAt
    ? new Date(job.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="page-container">
      {/* One header, the shape every other agent page uses: identity and the
          four figures on one slim panel, with Back and the status beside the
          title instead of on a row of their own above a second card. */}
      <WorkspaceHeader
        title={job.title}
        context={[
          loc,
          job.category,
          typeof (job as unknown as Record<string, unknown>).employerId === "object"
            ? ((job as unknown as Record<string, unknown>).employerId as { companyName?: string })?.companyName
            : null,
          t("posted", { date: posted }),
        ].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="ghost" className="min-h-11 gap-2 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/${locale}/agent/jobs`)}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t("backToJobs")}</span>
            </Button>
            <Badge className={`${STATUS_COLORS[job.status] ?? ""} border px-2.5 py-1 text-xs font-semibold`}>
              {job.status.replace("_", " ")}
            </Badge>
            <Link href={`/${locale}/agent/candidates?jobId=${id}`}>
              <Button variant="outline" aria-label={t("viewCandidates")} className="min-h-11 gap-2 rounded-xl">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">{t("viewCandidates")}</span>
              </Button>
            </Link>
          </>
        }
        metrics={[
          { label: t("vacancies"), value: job.vacancies ?? 1, icon: Users, tone: "primary" },
          { label: t("views"), value: job.views ?? 0, icon: Eye, tone: "info" },
          {
            label: job.salary?.isNegotiable ? `${job.salary?.currency ?? "USD"} (${t("negotiable")})` : (job.salary?.currency ?? "USD"),
            value: job.salary?.min && job.salary?.max
              ? `${formatCount(job.salary.min)}–${formatCount(job.salary.max)}`
              : "—",
            icon: DollarSign,
            tone: "success",
          },
          { label: t("expires"), value: expires ?? t("noExpiry"), icon: Clock, tone: "warning" },
        ]}
      />

      {/* Description */}
      <div className="card-base panel-body">
        <h2 className="heading-section font-semibold text-foreground mb-3">{t("jobDescription")}</h2>
        <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
          {job.description}
        </div>
      </div>

      {/* Requirements */}
      {job.requirements && (
        <div className="card-base panel-body">
          <h2 className="heading-section font-semibold text-foreground mb-4">{t("requirements")}</h2>

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
                  {job.requirements.experienceMin ?? 0}–{job.requirements.experienceMax ?? 30} {t("years")}
                </p>
              </div>
            )}
            {job.requirements.education && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("education")}</p>
                <p className="text-sm font-semibold text-foreground">{job.requirements.education}</p>
              </div>
            )}
            {job.requirements.languages && job.requirements.languages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("languages")}</p>
                <p className="text-sm font-semibold text-foreground">{job.requirements.languages.join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="card-base panel-body">
          <h2 className="heading-section font-semibold text-foreground mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" /> {t("tags")}
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
