import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/DashboardKit";
import { JobSummaryCard } from "@/components/features/job-seeker/JobSummaryCard";
import { HOME_RECOMMENDED_JOB_COUNT } from "@/lib/jobRecommendations";
import type { LimitingFactor } from "@/lib/matching/recommend";
import type { FeedJob, RecommendationSummary } from "./types";

/**
 * Where the "improve" link on an empty or short list should go. Gates the
 * seeker set themselves are preferences; everything else — missing skills,
 * roles, experience, education, or simply a low score — is fixed on the
 * profile. Mirrors the digest email's near-miss link.
 */
const PREFERENCE_FACTORS: ReadonlySet<LimitingFactor> = new Set(["no_location", "country", "salary", "work_mode"]);

interface Props {
  locale: string;
  jobs: FeedJob[];
  recommendation: RecommendationSummary | null;
  hasPreferences: boolean;
  loading?: boolean;
}

/**
 * Only `recommended` jobs (eligible and at or above the admin threshold) sit
 * here, each with the engine's match percentage. An empty answer is final and
 * the panel explains it with the pool's limitingFactor.
 */
export function RecommendedJobsPanel({ locale, jobs, recommendation, hasPreferences, loading = false }: Props) {
  const t = useTranslations("jobSeekerHome");
  const tCard = useTranslations("jobCard");

  const limitingFactor = recommendation?.limitingFactor ?? null;
  const improveOnPreferences = limitingFactor !== null && PREFERENCE_FACTORS.has(limitingFactor);
  const improveHref = `/${locale}/job-seeker/${improveOnPreferences ? "preferences" : "profile"}`;
  // No country known: nothing was matched at all, so the empty state asks for
  // the country instead of quoting a closest match.
  const noLocation = limitingFactor === "no_location";
  const improveLabel = t(
    noLocation ? "recommendedJobs.addCountryCta" : improveOnPreferences ? "recommendedJobs.updatePreferencesCta" : "recommendedJobs.improveProfileCta",
  );
  const shown = jobs.slice(0, HOME_RECOMMENDED_JOB_COUNT);

  return (
    <Panel
      id="job-seeker-recommended"
      icon={Sparkles}
      title={t("recommendedJobs.forYou")}
      subtitle={shown.length > 0 ? t("recommendedJobs.strongCount", { count: shown.length }) : t("recommendedJobs.title")}
      action={{ href: `/${locale}/job-seeker/jobs`, label: t("recommendedJobs.viewAll") }}
    >
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <div className="space-y-3">
          {shown.map((job, index) => (
            <JobSummaryCard
              key={job._id || `job-${index}`}
              locale={locale}
              job={{
                _id: job._id,
                title: job.title,
                createdAt: job.createdAt,
                matchScore: job.matchScore,
                employmentType: job.employmentType,
                location: job.location,
                salary: job.salary,
                skills: job.skills,
                matchedSkills: job.matchedSkills,
                company: job.employerId ? { _id: job.employerId._id, name: job.employerId.companyName, logo: job.employerId.logo } : null,
              }}
              actions={
                <Button asChild size="sm" className="min-h-11 rounded-xl px-4">
                  <Link href={`/${locale}/job-seeker/jobs/${job._id}`}>
                    {tCard("viewJob")}
                    <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
          ))}
          {/* Fewer strong matches than cards: say that is all there is, rather
              than padding the list with weaker jobs under this heading. */}
          {shown.length < HOME_RECOMMENDED_JOB_COUNT && (
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 pt-1 text-center text-sm text-muted-foreground">
              <span>{t("recommendedJobs.noOtherStrong")}</span>
              <Link href={improveHref} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                {improveLabel}
              </Link>
            </p>
          )}
        </div>
      ) : hasPreferences ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-4 py-8 text-center sm:px-6">
          <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="text-base font-semibold text-foreground">
            {t(noLocation ? "recommendedJobs.noLocationTitle" : "recommendedJobs.strongOnlyTitle")}
          </div>
          {recommendation && !noLocation && (
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              {recommendation.bestScore > 0
                ? t("recommendedJobs.strongOnlyBody", { threshold: recommendation.threshold, best: recommendation.bestScore })
                : t("recommendedJobs.strongOnlyBodyNone", { threshold: recommendation.threshold })}
            </p>
          )}
          {limitingFactor && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t(`recommendedJobs.blockers.${limitingFactor}`)}</p>}
          <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button asChild className="min-h-11 rounded-full px-6 shadow-sm">
              <Link href={improveHref}>{improveLabel}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-full px-6">
              <Link href={`/${locale}/job-seeker/jobs`}>
                <Search className="me-2 h-4 w-4" aria-hidden="true" />
                {t("recommendedJobs.browseJobsCta")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-4 py-8 text-center sm:px-6">
          <div className="text-base font-semibold text-foreground">{t("recommendedJobs.emptyTitle")}</div>
          <p className="mt-2 text-sm text-muted-foreground">{t("recommendedJobs.emptyBody")}</p>
          <Link
            href={`/${locale}/job-seeker/preferences`}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm"
          >
            {t("recommendedJobs.emptyCta")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      )}
    </Panel>
  );
}
