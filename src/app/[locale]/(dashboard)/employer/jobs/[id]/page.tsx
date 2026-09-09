"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowRight, Briefcase, CalendarRange, CheckCircle2, Clock, DollarSign, Eye, Gauge, Laptop, Tag, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useJobDetail } from "@/hooks/useJobs";
import { useJobHiringSummary, type JobHiringSummary } from "@/hooks/useJobHiringSummary";
import { HiringProgress } from "@/components/features/employer/jobs/HiringProgress";
import { formatCount } from "@/lib/ui/intlFormat";

interface AttentionItem {
  key: string;
  label: string;
  href: string;
}

interface JobFact {
  key: string;
  label: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
}

function buildAttentionItems(
  summary: JobHiringSummary | undefined,
  t: (key: string, values?: Record<string, number>) => string,
  locale: string,
  id: string,
): AttentionItem[] {
  if (!summary) return [];
  const jobHref = `/${locale}/employer/jobs/${id}`;
  const interviewsHref = `${jobHref}/interviews`;
  const offersHref = `${jobHref}/offers?status=pending`;
  const candidates: Array<[string, number, string]> = [
    ["unreviewed", summary.unreviewed, `${jobHref}/applications?unreviewed=1`],
    ["interviewsAwaitingOutcome", summary.interviews.awaitingOutcome, interviewsHref],
    ["rescheduleRequests", summary.interviews.rescheduleRequests, interviewsHref],
    ["interviewsUpcoming", summary.interviews.upcoming, interviewsHref],
    ["offersExpiring", summary.offers.expiringSoon, offersHref],
    ["offersPending", summary.offers.pending, offersHref],
    // Background checks live on their own page, scoped by job. This used to
    // point at the Hires tab, which only lists candidates who accepted an
    // offer — so an in-progress check on a candidate who is not hired yet
    // landed on an empty "No hires yet" screen.
    ["checksInProgress", summary.checks.inProgress, `/${locale}/employer/background-checks?jobId=${id}`],
  ];
  return candidates
    .filter(([, count]) => count > 0)
    .map(([key, count, href]) => ({ key, label: t(key, { count }), href }));
}

function AttentionList({ items, onNavigate }: { items: AttentionItem[]; onNavigate?: () => void }) {
  return (
    <ul role="list" className="divide-y divide-border/60">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-foreground hover:text-primary"
          >
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              {item.label}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Overview tab: job copy, facts, and what needs attention right now. */
export default function JobOverviewPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("employerJobWorkspace");
  // Employment-type / work-mode labels live with the form step that sets them
  // (`employerJobForm.step1.employmentTypes.*` / `.workModes.*`).
  const tf = useTranslations("employerJobForm.step1");
  const { data: job } = useJobDetail(id);
  const { data: summary } = useJobHiringSummary(id);
  const [sheetOpen, setSheetOpen] = useState(false);

  const jobHref = `/${locale}/employer/jobs/${id}`;

  // Legacy deep links from before the workspace: ?tab= and ?poster=1.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "workflow") router.replace(`${jobHref}/setup?section=workflow`);
    else if (tab === "matching-weights") router.replace(`${jobHref}/setup?section=weights`);
    else if (searchParams.get("poster") === "1") router.replace(`${jobHref}/posting?create=1`);
  }, [searchParams, router, jobHref]);

  if (!job) return null;

  const dateLocale = locale === "ar" ? "ar" : "en-US";
  const expires = job.expiresAt
    ? new Date(job.expiresAt).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" })
    : null;
  // "20,000–20,000 INR" is a single figure, not a range; the period is part of the number.
  const salaryMin = job.salary?.min || 0;
  const salaryMax = job.salary?.max || 0;
  let salary = "—";
  if (salaryMin || salaryMax) {
    const amount = salaryMin && salaryMax && salaryMin !== salaryMax
      ? `${formatCount(salaryMin)}–${formatCount(salaryMax)}`
      : formatCount(salaryMin || salaryMax);
    const range = `${amount} ${job.salary?.currency ?? "USD"}`;
    const period = job.salary?.period;
    salary = period === "monthly" ? t("salaryMonthly", { range })
      : period === "yearly" ? t("salaryYearly", { range })
      : period === "lpa" ? t("salaryLpa", { range })
      : range;
  }
  const salaryHint = [
    job.salary?.isNegotiable ? t("negotiable") : null,
    job.showSalary === false ? t("salaryHidden") : null,
  ].filter(Boolean).join(" · ");
  const items = buildAttentionItems(summary, t, locale, id);

  // Facts render only when the employer set them — an empty "Duration —" cell
  // reads as an unfinished product, not as information.
  const facts: JobFact[] = [
    { key: "vacancies", label: t("factsVacancies"), value: String(job.vacancies ?? 1), Icon: Users },
    { key: "views", label: t("factsViews"), value: formatCount(job.views ?? 0), Icon: Eye },
    { key: "salary", label: t("factsSalary"), value: salary, hint: salaryHint || undefined, Icon: DollarSign },
    { key: "expires", label: t("factsExpires"), value: expires ?? t("noExpiry"), Icon: Clock },
  ];
  if (job.employmentType) facts.push({ key: "employmentType", label: t("factsEmploymentType"), value: tf(`employmentTypes.${job.employmentType}`), Icon: Briefcase });
  if (job.workMode) facts.push({ key: "workMode", label: t("factsWorkMode"), value: tf(`workModes.${job.workMode}`), Icon: Laptop });
  if (job.duration) facts.push({ key: "duration", label: t("factsDuration"), value: job.duration, Icon: CalendarRange });
  if (job.maxApplicants) facts.push({ key: "maxApplicants", label: t("factsMaxApplicants"), value: formatCount(job.maxApplicants), Icon: Gauge });

  const req = job.requirements;
  const hasRequirements = Boolean(
    req && ((req.skills?.length ?? 0) > 0 || req.experienceMin !== undefined || req.experienceMax !== undefined || req.education || (req.languages?.length ?? 0) > 0),
  );

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      {/* Side column. One grid cell, not two: as separate cells the copy column's
          row-span split its height across both rows and stranded Job facts a
          screen below Needs attention. */}
      <div className="order-1 space-y-3 sm:space-y-4 lg:order-2 lg:col-start-2">
      {/* Needs attention — phone: one line + bottom sheet; tablet/desktop: panel in the side column. */}
      <section aria-labelledby="job-attention-heading">
        <div className="card-base panel-body">
          <h2 id="job-attention-heading" className="heading-section mb-1 font-semibold text-foreground">{t("needsAttentionTitle")}</h2>
          {summary && items.length === 0 ? (
            <p className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> {t("needsAttentionEmpty")}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 sm:hidden">
                <p className="text-sm text-muted-foreground">{t("needsAttentionSummary", { count: items.length })}</p>
                {items.length > 0 && (
                  <Button variant="outline" size="sm" className="min-h-11 shrink-0 rounded-xl" onClick={() => setSheetOpen(true)}>
                    {t("needsAttentionView")}
                  </Button>
                )}
              </div>
              <div className="hidden sm:block">
                {items.length > 0 ? <AttentionList items={items} /> : <div className="h-6 animate-pulse rounded bg-muted/50" />}
              </div>
            </>
          )}
        </div>
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("needsAttentionTitle")}</DialogTitle>
            </DialogHeader>
            <AttentionList items={items} onNavigate={() => setSheetOpen(false)} />
          </DialogContent>
        </Dialog>
      </section>

      {/* Facts */}
      <section aria-labelledby="job-facts-heading">
        <div className="card-base panel-body">
          <h2 id="job-facts-heading" className="heading-section mb-3 font-semibold text-foreground">{t("factsHeading")}</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-2">
            {facts.map(({ key, label, value, hint, Icon }) => (
              <div key={key} className="min-w-0 rounded-xl bg-secondary/50 px-3 py-2">
                <dt className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3 w-3" aria-hidden /> {label}
                </dt>
                <dd className="min-w-0">
                  <span className="block truncate text-sm font-semibold tabular-nums text-foreground" title={value}>{value}</span>
                  {hint ? <span className="block truncate text-xs text-muted-foreground" title={hint}>{hint}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      </div>

      {/* Hiring progress + copy. The funnel lives here, not in the job header (A18). */}
      <div className="order-2 space-y-3 sm:space-y-4 lg:order-1 lg:col-start-1">
        <HiringProgress summary={summary} jobHref={`/${locale}/employer/jobs/${id}`} />
        <section aria-labelledby="job-description-heading" className="card-base panel-body">
          <h2 id="job-description-heading" className="heading-section mb-3 font-semibold text-foreground">{t("overviewDescription")}</h2>
          {job.description ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{job.description}</div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("overviewNoDescription")}</p>
          )}
        </section>

        {job.responsibilities && job.responsibilities.length > 0 && (
          <section aria-labelledby="job-responsibilities-heading" className="card-base panel-body">
            <h2 id="job-responsibilities-heading" className="heading-section mb-3 font-semibold text-foreground">{t("overviewResponsibilities")}</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground/80">
              {job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>
        )}

        {job.qualifications && job.qualifications.length > 0 && (
          <section aria-labelledby="job-qualifications-heading" className="card-base panel-body">
            <h2 id="job-qualifications-heading" className="heading-section mb-3 font-semibold text-foreground">{t("overviewQualifications")}</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground/80">
              {job.qualifications.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </section>
        )}

        {/* Benefits and learning outcomes come from the edit form too; before
            this they were stored and never shown. Absent when the employer
            left them empty — the section, not a placeholder. */}
        {job.benefits && job.benefits.length > 0 && (
          <section aria-labelledby="job-benefits-heading" className="card-base panel-body">
            <h2 id="job-benefits-heading" className="heading-section mb-3 font-semibold text-foreground">{t("overviewBenefits")}</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground/80">
              {job.benefits.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>
        )}

        {job.learningOutcomes && job.learningOutcomes.length > 0 && (
          <section aria-labelledby="job-learning-heading" className="card-base panel-body">
            <h2 id="job-learning-heading" className="heading-section mb-3 font-semibold text-foreground">{t("overviewLearningOutcomes")}</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground/80">
              {job.learningOutcomes.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </section>
        )}

        {hasRequirements && req && (
          <section aria-labelledby="job-requirements-heading" className="card-base panel-body">
            <h2 id="job-requirements-heading" className="heading-section mb-4 font-semibold text-foreground">{t("overviewRequirements")}</h2>
            {req.skills && req.skills.length > 0 && (
              <div className="mb-5">
                <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("overviewSkills")}</p>
                <div className="flex flex-wrap gap-2">
                  {req.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="border-0 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
              {(req.experienceMin !== undefined || req.experienceMax !== undefined) && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("overviewExperience")}</p>
                  <p className="text-sm font-semibold text-foreground">{t("overviewYearsRange", { min: req.experienceMin ?? 0, max: req.experienceMax ?? 30 })}</p>
                </div>
              )}
              {req.education && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("overviewEducation")}</p>
                  <p className="text-sm font-semibold text-foreground">{req.education}</p>
                </div>
              )}
              {req.languages && req.languages.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("overviewLanguages")}</p>
                  <p className="text-sm font-semibold text-foreground">{req.languages.join(", ")}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {job.tags && job.tags.length > 0 && (
          <section aria-labelledby="job-tags-heading" className="card-base panel-body">
            <h2 id="job-tags-heading" className="heading-section mb-3 flex items-center gap-2 font-semibold text-foreground">
              <Tag className="h-4 w-4 text-muted-foreground" aria-hidden /> {t("overviewTags")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {job.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs font-medium">{tag}</Badge>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
