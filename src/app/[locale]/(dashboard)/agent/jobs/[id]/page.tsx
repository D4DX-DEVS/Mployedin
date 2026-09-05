"use client";

import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, MapPin, Briefcase, DollarSign, Users, Eye,
  Calendar, Tag, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
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
      {/* Back + View Candidates */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/${locale}/agent/jobs`)}>
          <ArrowLeft className="w-4 h-4" /> {t("backToJobs")}
        </Button>
        <Link href={`/${locale}/agent/candidates?jobId=${id}`}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> {t("viewCandidates")}
          </Button>
        </Link>
      </div>

      {/* Header card */}
      <div className="card-base panel-body">
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
              {(job as unknown as Record<string, unknown>).employerId && typeof (job as unknown as Record<string, unknown>).employerId === "object" ? (
                <>
                  <span className="text-border">·</span>
                  <span className="text-foreground/70 font-medium">
                    {((job as unknown as Record<string, unknown>).employerId as { companyName?: string })?.companyName}
                  </span>
                </>
              ) : null}
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
                ? `${formatCount(job.salary.min)}–${formatCount(job.salary.max)}`
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
