"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, DollarSign, Edit2, Loader2, Send, Trash2, Users, Eye, Tag, Clock, UserSearch, ImagePlus,
} from "lucide-react";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { useQueryClient } from "@tanstack/react-query";
import { jobKeys, useJobDetail } from "@/hooks/useJobs";
import Link from "next/link";
import { formatCount } from "@/lib/ui/intlFormat";
import { useMediaQuery, PHONE_QUERY } from "@/hooks/useMediaQuery";
import { JOB_STATUS_BADGE_CLASS, jobStatusLabelKey } from "@/components/features/employer/jobs/jobStatus";
import { dedupeListItems } from "@/lib/jobs/descriptionSections";
import { useAgentJobActions } from "../_components/useAgentJobActions";

export default function AgentJobDetailPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { data: job, isLoading: loading } = useJobDetail(id);
  const t = useTranslations("agentJobDetail");
  const tJobs = useTranslations("employerJobs");
  const tWs = useTranslations("employerJobWorkspace");
  // Which employer-view destination is opening ("" = the job page), so the
  // spinner sits on the button that was pressed.
  const [openingTarget, setOpeningTarget] = useState<string | null>(null);
  const openingEmployerView = openingTarget === "";
  const queryClient = useQueryClient();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const draftActions = useAgentJobActions(() => { void queryClient.invalidateQueries({ queryKey: jobKeys.details() }); });

  // The employer's own job page (applications, interviews, offers, hires,
  // posting, setup) in "view as employer" mode: the tenant view an agent
  // already uses from their employers list, landing on this job.
  async function openEmployerView(subPath = "") {
    const employerId = job?.employerId?._id;
    if (!employerId) return;
    setOpeningTarget(subPath);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (!res.ok) {
        toast.error(t("openEmployerViewError"));
        setOpeningTarget(null);
        return;
      }
      // A full navigation: the client router can still hold the redirect it
      // was given for /employer before the tenant-view cookie existed.
      window.location.assign(`/${locale}/employer/jobs/${id}${subPath}`);
    } catch {
      toast.error(t("openEmployerViewError"));
      setOpeningTarget(null);
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
  // Phones: four metric tiles share 375px, so thousands go compact too
  // (3.5K–8.5K); "3,500–8,500" ran into the next tile.
  const compactFrom = isPhone ? 1_000 : 100_000;
  // Four tiles share a phone's width: a long value ("No expiry", a salary
  // range) steps down a size so it stays inside its own tile.
  const phoneFit = (value: string) => (isPhone && value.length > 6 ? <span className="text-sm">{value}</span> : value);
  const money = (n: number) =>
    formatCount(n, n >= compactFrom ? { notation: "compact", maximumFractionDigits: 1 } : undefined, locale);
  const salaryValue = salaryMin && salaryMax
    ? `${money(salaryMin)}–${money(salaryMax)}`
    : salaryMin
      ? `${money(salaryMin)}+`
      : job.salary?.isNegotiable ? t("negotiable") : isPhone ? "—" : t("notDisclosed");

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
            <span className={`${JOB_STATUS_BADGE_CLASS[job.status] ?? ""} inline-flex shrink-0 items-center self-center rounded-full border px-2 py-1 text-[11px] font-semibold sm:px-2.5`}>
              {tJobs(jobStatusLabelKey(job.status))}
            </span>
            {job.viewerCanEdit && job.status === "draft" ? (
              <>
                {/* A draft's next steps: finish it, publish it, or throw it away. */}
                <Button
                  variant="outline"
                  onClick={() => { void draftActions.discard(id).then((ok) => { if (ok) router.push(`/${locale}/agent/jobs`); }); }}
                  disabled={draftActions.isPending(id, "delete")}
                  aria-label={tJobs("deleteButton")}
                  className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4 text-destructive hover:text-destructive"
                >
                  {draftActions.isPending(id, "delete") ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  <span className="hidden sm:inline">{tJobs("deleteButton")}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { void draftActions.publish(id); }}
                  disabled={draftActions.isPending(id, "publish")}
                  aria-label={tJobs("publishButton")}
                  className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4"
                >
                  {draftActions.isPending(id, "publish") ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  <span className="hidden sm:inline">{draftActions.isPending(id, "publish") ? tJobs("publishingButton") : tJobs("publishButton")}</span>
                </Button>
                <Button asChild className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4">
                  <Link href={`/${locale}/agent/jobs/${id}/edit`} aria-label={tJobs("continueDraftButton")}>
                    <Edit2 className="h-4 w-4" aria-hidden />
                    {/* The draft's next step keeps a label on phones too — the short one, so the row fits. */}
                    <span className="sm:hidden">{t("continueShort")}</span>
                    <span className="hidden sm:inline">{tJobs("continueDraftButton")}</span>
                  </Link>
                </Button>
              </>
            ) : job.viewerCanEdit && job.status !== "closed" ? (
              <Button asChild variant="outline" className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4">
                <Link href={`/${locale}/agent/jobs/${id}/edit`} aria-label={tJobs("editButton")}>
                  <Edit2 className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{tJobs("editButton")}</span>
                </Link>
              </Button>
            ) : null}
            {job.status !== "draft" && <Link href={`/${locale}/agent/candidates?jobId=${id}`}>
              <Button variant="outline" aria-label={t("viewCandidates")} className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">{t("viewCandidates")}</span>
              </Button>
            </Link>}
            {job.status !== "draft" && <Link href={`/${locale}/agent/jobs/${id}/matches`}>
              <Button variant={job.viewerCanManage ? "outline" : "default"} aria-label={t("findCandidates")} className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4">
                <UserSearch className="h-4 w-4" />
                <span className="hidden sm:inline">{t("findCandidates")}</span>
              </Button>
            </Link>}
            {/* Straight to the poster maker: it lives in the employer's job
                page, which used to mean opening that view, then scrolling its
                tabs to Posting, then Create poster. */}
            {POSTERS_ENABLED && job.viewerCanManage ? (
              <Button
                variant="outline"
                onClick={() => { void openEmployerView("/poster"); }}
                disabled={openingTarget !== null}
                aria-label={tWs("postingCreatePoster")}
                className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4"
              >
                {openingTarget === "/poster" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
                <span className="hidden sm:inline">{tWs("postingCreatePoster")}</span>
              </Button>
            ) : null}
            {job.viewerCanManage ? (
              <Button
                variant={job.status === "draft" ? "outline" : "default"}
                onClick={() => { void openEmployerView(); }}
                disabled={openingTarget !== null}
                aria-label={t("openEmployerView")}
                className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4"
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
            // A range is the widest value; on phones it steps down a size so it
            // stays inside its quarter of the strip.
            value: phoneFit(salaryValue),
            icon: DollarSign,
            tone: "success",
          },
          { label: t("expires"), value: phoneFit(expires ?? t("noExpiry")), icon: Clock, tone: "warning" },
        ]}
      />

      {draftActions.dialog}

      {/* Description */}
      <div className="card-base panel-body">
        <h2 className="heading-section font-semibold text-foreground mb-3">{t("jobDescription")}</h2>
        <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
          {job.description}
        </div>
      </div>

      {([
        ["overviewResponsibilities", job.responsibilities],
        ["overviewQualifications", job.qualifications],
        ["overviewBenefits", job.benefits],
      ] as const).map(([key, list]) => {
        const items = dedupeListItems(list ?? []);
        if (items.length === 0) return null;
        return (
          <div key={key} className="card-base panel-body">
            <h2 className="heading-section font-semibold text-foreground mb-3">{tWs(key)}</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground/80">
              {items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        );
      })}

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
