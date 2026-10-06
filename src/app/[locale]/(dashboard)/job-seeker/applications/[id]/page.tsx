"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Calendar,
  ExternalLink,
  Gauge,
  Lightbulb,
  LogOut,
  MapPin,
  RotateCcw,
  Star,
  ThumbsUp,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { userInitials } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { formatApplicationDate, formatApplicationSalary } from "@/lib/jobSeeker/applicationFormat";
import { buildApplicationTimeline, nextStepFor, type NextStepKey } from "@/lib/jobSeeker/applicationTimeline";
import { useRefreshSeekerApplications, useSeekerApplication } from "@/hooks/useSeekerApplications";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { WithdrawApplicationDialog } from "@/components/features/job-seeker/WithdrawApplicationDialog";
import { ApplicationTimeline } from "./_components/ApplicationTimeline";
import { InterviewActionCard } from "./_components/InterviewActionCard";
import { OfferActionCard } from "./_components/OfferActionCard";
import { DocumentsSection } from "./_components/DocumentsSection";
import { WhatYouSent } from "./_components/WhatYouSent";
import type { InterviewItem, OfferItem } from "./_components/types";

interface ApplicationDetail {
  _id: string;
  status: string;
  aiMatchScore?: number;
  appliedAt: string;
  viewedByEmployerAt?: string;
  coverLetter?: string;
  screeningAnswers?: { questionId?: string; questionLabel: string; answer: unknown }[];
  documents?: { name: string; url: string; type: string }[];
  statusHistory: { status: string; changedAt: string; note?: string }[];
  jobId: {
    _id: string;
    title: string;
    status?: string;
    location?: { city?: string; country?: string; isRemote?: boolean };
    salary?: { min?: number; max?: number; currency?: string };
    employerId?: { _id: string; companyName?: string; logo?: string };
  } | null;
  interviews?: InterviewItem[];
  offers?: OfferItem[];
}

const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];

/**
 * One application, the way LinkedIn, Indeed and Naukri show an applied job:
 * where it stands and what happens next, the dated trail (including when the
 * employer opened it), anything that needs a reply, what was sent, and the
 * job beside it. Before (client report 2026-10-06) the page was a header,
 * undated status pills and the documents list.
 */
export default function ApplicationDetailPage() {
  const { id, locale } = useParams<{ id: string; locale: string }>();
  const t = useTranslations("applicationDetail");
  const tc = useTranslations("common");
  const ta = useTranslations("jobSeekerApplications");
  const { goBack } = useBackNavigation(`/${locale}/job-seeker/applications`);
  const { data: app, isPending, isError, refetch } = useSeekerApplication<ApplicationDetail>(id);
  const refresh = useRefreshSeekerApplications();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  useEffect(() => {
    document.title = app?.jobId?.title ? `${app.jobId.title} · MPLOYEDIN` : "Application Details · MPLOYEDIN";
  }, [app?.jobId?.title]);

  if (isPending) return <DetailSkeleton />;

  if (isError || !app) {
    return (
      <div className="page-container max-w-5xl py-16 text-center">
        <p className="text-muted-foreground">{isError ? t("errorLoadingDetails") : t("applicationNotFound")}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="me-2 size-4 rtl:rotate-180" /> {tc("back")}
          </Button>
          {isError && (
            <Button onClick={() => refetch()}>
              <RotateCcw className="me-2 size-4" /> {tc("tryAgain")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const job = app.jobId;
  const employer = job?.employerId && typeof job.employerId === "object" ? job.employerId : null;
  const jobTitle = job?.title ?? t("position");
  const isActive = !TERMINAL_STATUSES.includes(app.status);
  const salary = formatApplicationSalary(job?.salary, locale);
  const location = job?.location?.isRemote
    ? t("remote")
    : [job?.location?.city, job?.location?.country].filter(Boolean).join(", ");
  const timeline = buildApplicationTimeline(app);
  const nextStep = nextStepFor(app.status, !!app.viewedByEmployerAt);
  const interviews = app.interviews ?? [];
  const offers = app.offers ?? [];
  const jobPath = job?._id ? `/${locale}/job-seeker/jobs/${job._id}` : null;

  return (
    <div className="page-container max-w-5xl pt-3 md:pt-4">
      {/* self-start: .page-container is a flex column, so the button stretched
          full width and its label sat in the middle of the page. */}
      <Button variant="ghost" size="sm" className="-ms-2 gap-1.5 self-start text-muted-foreground hover:text-foreground" onClick={goBack}>
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToApplications")}
      </Button>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="card-base rounded-2xl border panel-body">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-primary/10 text-sm font-semibold text-primary">
            {employer?.logo ? (
              <img src={employer.logo} alt={employer.companyName ?? ""} className="size-full bg-card object-contain p-1.5" />
            ) : (
              userInitials(employer?.companyName ?? t("company"))
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-snug sm:text-2xl">{jobTitle}</h1>
            <p className="text-sm text-muted-foreground">{employer?.companyName ?? t("company")}</p>
          </div>
          <StatusBadge status={app.status} size="md" />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-4" aria-hidden="true" />
            {t("applied")} {formatApplicationDate(app.appliedAt, locale, { withYear: true })}
          </span>
          {location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" /> {location}
            </span>
          )}
          {salary && (
            <span className="flex items-center gap-1.5">
              <Banknote className="size-4" aria-hidden="true" /> {salary}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {jobPath && (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={jobPath}>
                <ExternalLink className="size-4" aria-hidden="true" /> {t("viewJobPosting")}
              </Link>
            </Button>
          )}
          {isActive ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setWithdrawOpen(true)}
            >
              <LogOut className="size-4" aria-hidden="true" /> {ta("withdraw")}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="gap-1.5 text-amber-700 hover:text-amber-800" asChild>
              <Link href={`/${locale}/job-seeker/applications/${app._id}/feedback`}>
                <Star className="size-4" aria-hidden="true" /> {ta("rateExperience")}
              </Link>
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Main column ──────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {nextStep && <NextStepCallout step={nextStep} locale={locale} />}

          {interviews.length > 0 && (
            <section className="space-y-3" aria-labelledby="interviews-heading">
              <h2 id="interviews-heading" className="heading-section flex items-center gap-2 font-semibold">
                <Video className="size-4" aria-hidden="true" /> {t("interviews")} ({interviews.length})
              </h2>
              {interviews.map((iv) => (
                <InterviewActionCard key={iv._id} interview={iv} onUpdated={refresh} />
              ))}
            </section>
          )}

          {offers.length > 0 && (
            <section className="space-y-3" aria-labelledby="offers-heading">
              <h2 id="offers-heading" className="heading-section flex items-center gap-2 font-semibold">
                <ThumbsUp className="size-4" aria-hidden="true" /> {t("offers")} ({offers.length})
              </h2>
              {offers.map((offer) => (
                <OfferActionCard key={offer._id} offer={offer} onUpdated={refresh} />
              ))}
            </section>
          )}

          <ApplicationTimeline events={timeline} />

          <WhatYouSent coverLetter={app.coverLetter} screeningAnswers={app.screeningAnswers}>
            <DocumentsSection
              applicationId={app._id}
              documents={app.documents ?? []}
              isActive={isActive}
              onUpdated={refresh}
              t={t}
              tc={tc}
            />
          </WhatYouSent>
        </div>

        {/* ── The job ─────────────────────────────────────────────────
            The header already names the job, company, place and pay; this
            card adds what it doesn't: the match and whether the job is open. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start" aria-labelledby="job-card-heading">
          <section className="card-base rounded-2xl border panel-body">
            <h2 id="job-card-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {t("jobCardTitle")}
            </h2>

            {typeof app.aiMatchScore === "number" && app.aiMatchScore > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">{t("yourMatch")}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold">
                  <Gauge className="size-4 text-primary" aria-hidden="true" />
                  {t("matchScore", { score: app.aiMatchScore })}
                </p>
                {jobPath && (
                  <Link href={jobPath} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    {t("howMatchWorks")} <ArrowRight className="size-3 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}

            {job?.status && (
              <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                {job.status === "active" ? t("jobOpen") : t("jobClosed")}
              </p>
            )}

            {jobPath && (
              <Button variant="outline" size="sm" className="mt-3 w-full gap-1.5" asChild>
                <Link href={jobPath}>
                  <ExternalLink className="size-4" aria-hidden="true" /> {t("viewJobPosting")}
                </Link>
              </Button>
            )}
          </section>
        </aside>
      </div>

      <WithdrawApplicationDialog
        applicationId={app._id}
        jobTitle={jobTitle}
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        onWithdrawn={refresh}
      />
    </div>
  );
}

function NextStepCallout({ step, locale }: { step: NextStepKey; locale: string }) {
  const t = useTranslations("applicationDetail");
  const text = (() => {
    switch (step) {
      case "applied": return t("next.applied");
      case "applied_viewed": return t("next.applied_viewed");
      case "shortlisted": return t("next.shortlisted");
      case "interview_scheduled": return t("next.interview_scheduled");
      case "selected": return t("next.selected");
      case "offer": return t("next.offer");
      case "hired": return t("next.hired");
      case "rejected": return t("next.rejected");
      case "withdrawn": return t("next.withdrawn");
    }
  })();
  const closed = step === "rejected" || step === "withdrawn";
  return (
    <section
      className={cn(
        "flex gap-3 rounded-2xl border p-4",
        closed ? "border-border bg-muted/30" : "border-primary/20 bg-primary/[0.04]",
      )}
      aria-labelledby="next-step-heading"
    >
      <Lightbulb className={cn("mt-0.5 size-5 shrink-0", closed ? "text-muted-foreground" : "text-primary")} aria-hidden="true" />
      <div className="min-w-0">
        <h2 id="next-step-heading" className="text-sm font-semibold">{t("nextTitle")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
        {step === "rejected" && (
          <Link href={`/${locale}/job-seeker/jobs`} className="mt-2 inline-flex text-sm font-medium text-primary hover:underline">
            {t("findJobs")}
          </Link>
        )}
        {step === "hired" && (
          <Link href={`/${locale}/job-seeker/onboarding`} className="mt-2 inline-flex text-sm font-medium text-primary hover:underline">
            {t("goToOnboarding")}
          </Link>
        )}
      </div>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="page-container max-w-5xl pt-3 md:pt-4" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="card-base mt-2 h-40 animate-pulse rounded-2xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
          <div className="card-base h-56 animate-pulse rounded-2xl" />
          <div className="card-base h-32 animate-pulse rounded-2xl" />
        </div>
        <div className="card-base h-48 animate-pulse rounded-2xl" />
      </div>
    </div>
  );
}
