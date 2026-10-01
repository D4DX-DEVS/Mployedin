"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, DollarSign, Loader2, Users, Eye, Tag, Clock, UserSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { useJobDetail } from "@/hooks/useJobs";
import Link from "next/link";
import { formatCount } from "@/lib/ui/intlFormat";
import { JOB_STATUS_BADGE_CLASS, jobStatusLabelKey } from "@/components/features/employer/jobs/jobStatus";

export default function AgentJobDetailPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { data: job, isLoading: loading } = useJobDetail(id);
  const t = useTranslations("agentJobDetail");
  const tJobs = useTranslations("employerJobs");
  const [openingEmployerView, setOpeningEmployerView] = useState(false);

  // The employer's own job page (applications, interviews, offers, hires,
  // posting, setup) in "view as employer" mode: the tenant view an agent
  // already uses from their employers list, landing on this job.
  async function openEmployerView() {
    const employerId = job?.employerId?._id;
    if (!employerId) return;
    setOpeningEmployerView(true);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (!res.ok) {
        toast.error(t("openEmployerViewError"));
        setOpeningEmployerView(false);
        return;
      }
      // A full navigation: the client router can still hold the redirect it
      // was given for /employer before the tenant-view cookie existed.
      window.location.assign(`/${locale}/employer/jobs/${id}`);
    } catch {
      toast.error(t("openEmployerViewError"));
      setOpeningEmployerView(false);
    }
  }

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

  const posted = new Date(job.createdAt).toLocaleDateString(locale, {
    month: "long", day: "numeric", year: "numeric",
  });
  const expires = job.expiresAt
    ? new Date(job.expiresAt).toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })
    : null;
  const salaryMin = job.salary?.min ?? 0;
  const salaryMax = job.salary?.max ?? 0;
  // Short form for big figures (1.2M, not 1,200,000) so a range fits its card on a phone.
  const money = (n: number) =>
    formatCount(n, n >= 100_000 ? { notation: "compact", maximumFractionDigits: 1 } : undefined, locale);
  const salaryValue = salaryMin && salaryMax
    ? `${money(salaryMin)}–${money(salaryMax)}`
    : salaryMin
      ? `${money(salaryMin)}+`
      : job.salary?.isNegotiable ? t("negotiable") : t("notDisclosed");

  return (
    <div className="page-container">
      {/* Desktop only: one back link above the header, as on the employer's
          job page. Phones use the sidebar / system back. */}
      <Link
        href={`/${locale}/agent/jobs`}
        className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t("backToJobs")}
      </Link>

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
            {/* Status rides with the actions, styled and worded as on the employer's page. */}
            <span className={`${JOB_STATUS_BADGE_CLASS[job.status] ?? ""} inline-flex items-center self-center rounded-full border px-2.5 py-1 text-[11px] font-semibold`}>
              {tJobs(jobStatusLabelKey(job.status))}
            </span>
            <Link href={`/${locale}/agent/candidates?jobId=${id}`}>
              <Button variant="outline" aria-label={t("viewCandidates")} className="min-h-11 gap-2 rounded-xl">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">{t("viewCandidates")}</span>
              </Button>
            </Link>
            <Link href={`/${locale}/agent/jobs/${id}/matches`}>
              <Button variant={job.viewerCanManage ? "outline" : "default"} aria-label={t("findCandidates")} className="min-h-11 gap-2 rounded-xl">
                <UserSearch className="h-4 w-4" />
                <span className="hidden sm:inline">{t("findCandidates")}</span>
              </Button>
            </Link>
            {job.viewerCanManage ? (
              <Button
                onClick={() => { void openEmployerView(); }}
                disabled={openingEmployerView}
                aria-label={t("openEmployerView")}
                className="min-h-11 gap-2 rounded-xl"
              >
                {openingEmployerView ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Building2 className="h-4 w-4" aria-hidden />}
                <span className="hidden sm:inline">{openingEmployerView ? t("openingEmployerView") : t("openEmployerView")}</span>
              </Button>
            ) : null}
          </>
        }
        metrics={[
          { label: t("vacancies"), value: job.vacancies ?? 1, icon: Users, tone: "primary" },
          { label: t("views"), value: job.views ?? 0, icon: Eye, tone: "info" },
          {
            label: t("salaryIn", { currency: job.salary?.currency ?? "USD" }),
            value: salaryValue,
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
