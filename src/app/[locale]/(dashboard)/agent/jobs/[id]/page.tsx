"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, DollarSign, Edit2, Send, Trash2, Users, Eye, Tag, Clock, UserSearch, ImagePlus,
} from "lucide-react";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/shared/WorkspaceTabs";
import { RowActions } from "@/components/shared/RowActions";
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
      {/* Back link above the header, as on the employer's job page. */}
      <Link
        href={`/${locale}/agent/jobs`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
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
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Status badge beside title */}
            <span className={`${JOB_STATUS_BADGE_CLASS[job.status] ?? ""} inline-flex shrink-0 items-center self-center rounded-full border px-2 py-1 text-[11px] font-semibold sm:px-2.5`}>
              {tJobs(jobStatusLabelKey(job.status))}
            </span>

            {/* Main action: View candidates for active jobs, or draft actions for drafts */}
            {job.viewerCanEdit && job.status === "draft" ? (
              <>
                {/* A draft's next steps: finish it, publish it, or throw it away. */}
                <Button asChild className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4">
                  <Link href={`/${locale}/agent/jobs/${id}/edit`} aria-label={tJobs("continueDraftButton")}>
                    <Edit2 className="h-4 w-4" aria-hidden />
                    {/* The draft's next step keeps a label on phones too — the short one, so the row fits. */}
                    <span className="sm:hidden">{t("continueShort")}</span>
                    <span className="hidden sm:inline">{tJobs("continueDraftButton")}</span>
                  </Link>
                </Button>

                {/* Dropdown menu for draft actions */}
                <RowActions
                  name={job.title}
                  quick={[]}
                  menu={[
                    {
                      key: "publish",
                      label: draftActions.isPending(id, "publish") ? tJobs("publishingButton") : tJobs("publishButton"),
                      icon: Send,
                      pending: draftActions.isPending(id, "publish"),
                      disabled: draftActions.isPending(id, "publish"),
                      onSelect: () => { void draftActions.publish(id); },
                    },
                    {
                      key: "delete",
                      label: draftActions.isPending(id, "delete") ? tJobs("deletingButton") : tJobs("deleteButton"),
                      icon: Trash2,
                      destructive: true,
                      pending: draftActions.isPending(id, "delete"),
                      disabled: draftActions.isPending(id, "delete"),
                      onSelect: () => { void draftActions.discard(id).then((ok) => { if (ok) router.push(`/${locale}/agent/jobs`); }); },
                    },
                  ]}
                  labelsFrom="wide"
                />
              </>
            ) : job.status !== "draft" ? (
              <>
                {/* Main button: View candidates */}
                <Button asChild className="h-10 min-h-10 gap-1.5 rounded-xl px-2.5 sm:h-11 sm:min-h-11 sm:gap-2 sm:px-4">
                  <Link href={`/${locale}/agent/candidates?jobId=${id}`} aria-label={t("viewCandidates")}>
                    <Users className="h-4 w-4" aria-hidden="true" />
                    <span>{t("viewCandidates")}</span>
                  </Link>
                </Button>

                {/* Dropdown menu for other actions */}
                <RowActions
                  name={job.title}
                  quick={[]}
                  menu={[
                    {
                      key: "matches",
                      label: t("findCandidates"),
                      icon: UserSearch,
                      href: `/${locale}/agent/jobs/${id}/matches`,
                    },
                    ...(POSTERS_ENABLED && job.viewerCanManage ? [{
                      key: "poster",
                      label: tWs("postingCreatePoster"),
                      icon: ImagePlus,
                      pending: openingTarget === "/poster",
                      disabled: openingTarget !== null,
                      onSelect: () => { void openEmployerView("/poster"); },
                    }] : []),
                    ...(job.viewerCanEdit && job.status !== "closed" ? [{
                      key: "edit",
                      label: tJobs("editButton"),
                      icon: Edit2,
                      href: `/${locale}/agent/jobs/${id}/edit`,
                    }] : []),
                    ...(job.viewerCanManage ? [{
                      key: "employer",
                      label: openingEmployerView ? t("openingEmployerView") : t("openEmployerView"),
                      icon: Building2,
                      pending: openingEmployerView,
                      disabled: openingTarget !== null,
                      onSelect: () => { void openEmployerView(); },
                    }] : []),
                  ]}
                  labelsFrom="wide"
                />
              </>
            ) : null}
          </div>
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

      {/* Full-width salary tile */}
      {job.salary && (salaryMin || salaryMax || job.salary.isNegotiable) && (
        <div className="card-base panel-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-success shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("salaryIn", { currency: job.salary.currency ?? "USD" })}</p>
                <p className="text-sm sm:text-lg font-semibold text-foreground mt-1">{salaryValue}</p>
              </div>
            </div>
            {expires && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-warning shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("expires")}</p>
                  <p className="text-sm sm:text-lg font-semibold text-foreground mt-1">{expires}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {draftActions.dialog}

      {/* Tabs for navigation */}
      {job.status !== "draft" && (
        <WorkspaceTabs
          tabs={[
            { key: "overview", label: tWs("overview"), href: `/${locale}/agent/jobs/${id}` },
            { key: "matches", label: t("findCandidates"), href: `/${locale}/agent/jobs/${id}/matches` },
          ] as WorkspaceTab[]}
          activeKey="overview"
          ariaLabel={job.title}
        />
      )}

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
