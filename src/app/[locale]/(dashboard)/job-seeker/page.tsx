import { Suspense, cache } from "react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import ProfileView from "@/models/ProfileView";
import Job from "@/models/Job";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import {
  buildRecommendedJobQuery,
  HOME_RECOMMENDED_JOB_COUNT,
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDED_JOB_SELECT,
} from "@/lib/jobRecommendations";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";
import { getSeekerActivity } from "@/lib/jobSeeker/dashboard/activity.server";
import { countryKeyFromLocationText } from "@/lib/i18n/locations";
import { JobSeekerHomePage } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import { KpiStripSkeleton, PanelSkeleton } from "../admin/_components/section-states";
import { SectionError } from "../admin/_components/section-error";
import { HomeGrid } from "@/components/features/job-seeker/home/home-grid";
import { HomeHeader } from "@/components/features/job-seeker/home/home-header";
import { SeekerKpiStrip } from "@/components/features/job-seeker/home/kpi-strip";
import { ApplicationStatusPanel } from "@/components/features/job-seeker/home/status-panel";
import { RecommendedJobsPanel } from "@/components/features/job-seeker/home/recommended-panel";
import { RecentApplicationsPanel } from "@/components/features/job-seeker/home/applications-panel";
import { UpcomingInterviewsPanel } from "@/components/features/job-seeker/home/interviews-panel";
import { ProfileBoostPanel } from "@/components/features/job-seeker/home/boost-panel";
import { loadJobAlertCount, loadUnreadMessageCount, loadUpcomingInterviews } from "./_components/loaders";
import { hasJobPreferences, profileBoostTips, profileCompletion } from "@/components/features/job-seeker/home/profile-checks";
import type { AppliedJobSnippet, DashboardStats, FeedJob, ProfileData, RecommendationSummary } from "@/components/features/job-seeker/home/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * Job seeker home: one scrollable overview, ordered by what a seeker opens it for.
 *
 *   1. greeting, profile completeness and the four things they came to do;
 *   2. headline numbers with this week's change and a seven-day sparkline;
 *   3. the jobs the engine recommends, next to where their applications stand;
 *   4. recent applications, upcoming interviews and what would boost the profile.
 *
 * Every figure is counted from stored data. Each section streams in on its own
 * so the recommendation scoring never holds up the numbers, and vice versa.
 */

type SeekerDoc = NonNullable<Awaited<ReturnType<typeof loadSeeker>>>;

interface SectionContext {
  locale: string;
  seeker: SeekerDoc;
  profile: ProfileData;
  now: Date;
}

// Lean query — the fields the page paints plus every SEEKER_MATCH_FIELDS path
// (`cv` covers cv.rawText). A missing one silently changes the score: without
// totalExperienceYears a seeker with a stated total but no dated roles reads
// as "experience unknown" here and as known in the email.
function loadSeeker(userId: string) {
  return JobSeeker.findOne({ userId })
    .select(
      "_id userId skills preferredCountries preferredRoles preferredSalary preferredJobType " +
        "experience education languages summary profileCompleteness cvFileUrl cv " +
        "nationality currentLocation preferredLocations linkedin socialLinks " +
        "totalExperienceYears workStatus"
    )
    .lean();
}

/** One set of week/series/status aggregates per request, shared by the KPI strip and the donut. */
const activityFor = cache((seeker: SeekerDoc, now: Date) => getSeekerActivity(seeker._id, seeker.userId, now));

/** Runs one section's queries; a failure renders that section's error state and leaves the rest alone. */
async function load<T>(section: string, run: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    await connectDB();
    return { ok: true, data: await run() };
  } catch (err) {
    logger.error({ err, section }, "[job-seeker/home] section query failed");
    return { ok: false };
  }
}

async function Failed({ id, title }: { id: string; title: string }) {
  const t = await getTranslations("jobSeekerHome");
  return <SectionError id={id} title={title} message={t("sectionError.message")} retryLabel={t("sectionError.retry")} />;
}

/* ── Sections ── */

async function KpiSection({ locale, seeker, now }: SectionContext) {
  const t = await getTranslations("jobSeekerHome");
  const seekerId = seeker._id;
  const result = await load("kpis", async () => {
    // Dynamic import: the Offer model may not be available in every deployment.
    const Offer = await import("@/models/Offer").then((m) => m.default).catch(() => null);
    const [appCount, interviewCount, viewCount, pendingOfferCount, unreadMessageCount, jobAlerts, activity] = await Promise.all([
      Application.countDocuments({ jobSeekerId: seekerId }),
      Interview.countDocuments({ jobSeekerId: seekerId, scheduledAt: { $gte: now }, status: { $nin: ["cancelled"] } }),
      // ProfileView.jobSeekerId holds the User id (that is what
      // GET /api/job-seekers/[id] writes), not the JobSeeker profile _id — the
      // sibling counters correctly use seekerId, this one must not.
      ProfileView.countDocuments({ jobSeekerId: seeker.userId, viewedAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }),
      Offer ? Offer.countDocuments({ jobSeekerId: seekerId, status: "pending" }) : Promise.resolve(0),
      loadUnreadMessageCount(seeker.userId),
      loadJobAlertCount(seeker.userId),
      activityFor(seeker, now),
    ]);
    const stats: DashboardStats = {
      applicationsSent: { count: appCount, delta: activity.week.applications.current - activity.week.applications.previous, daily: activity.series.applications },
      upcomingInterviews: { count: interviewCount, delta: activity.week.interviews.current - activity.week.interviews.previous },
      recruiterViews: { total: viewCount, delta: activity.week.profileViews.current - activity.week.profileViews.previous, last7Days: activity.series.profileViews },
      pendingOffers: { count: Math.max(0, Number(pendingOfferCount) || 0) },
      unreadMessages: { count: Math.max(0, Number(unreadMessageCount) || 0) },
      jobAlerts: { count: jobAlerts },
    };
    return stats;
  });
  if (!result.ok) return <Failed id="job-seeker-kpis" title={t("kpi.title")} />;
  return <SeekerKpiStrip locale={locale} stats={result.data} />;
}

async function StatusSection({ locale, seeker, now }: SectionContext) {
  const t = await getTranslations("jobSeekerHome");
  const result = await load("status", () => activityFor(seeker, now));
  if (!result.ok) return <Failed id="job-seeker-status" title={t("statusBreakdown.title")} />;
  return <ApplicationStatusPanel locale={locale} breakdown={result.data.statusBreakdown} />;
}

async function RecommendedSection({ locale, seeker, profile, now }: SectionContext) {
  const t = await getTranslations("jobSeekerHome");
  const seekerId = seeker._id;
  const result = await load("recommended", async () => {
    // The candidate pool excludes applied jobs in the query itself (same as
    // /api/jobs/recommended), so this small, indexed lookup has to resolve first.
    // Withdrawn applications don't count — those jobs stay recommendable.
    const appliedJobIds = await Application.find({ jobSeekerId: seekerId, status: { $ne: "withdrawn" } })
      .select("jobId")
      .lean()
      .then((apps) => apps.map((a) => a.jobId));

    // Derive preferred countries from locations as a fallback (for seekers who have
    // location preferences but no explicit country preference)
    let preferredCountries = seeker.preferredCountries;
    if ((!preferredCountries || preferredCountries.length === 0) && seeker.preferredLocations?.length) {
      const derived: string[] = [];
      for (const location of seeker.preferredLocations) {
        const country = countryKeyFromLocationText(location);
        if (country && !derived.includes(country)) derived.push(country);
      }
      preferredCountries = derived.length > 0 ? derived : preferredCountries;
    }

    const [recentJobs, seekerProfile] = await Promise.all([
      Job.find(buildRecommendedJobQuery({ preferredCountries, excludeJobIds: appliedJobIds, now }))
        // Same pool window and tiebreaker as the feed, so the four cards here are
        // the first four of the feed's page one.
        .sort({ createdAt: -1, _id: -1 })
        .limit(RECOMMENDATION_POOL_SIZE)
        .select(RECOMMENDED_JOB_SELECT)
        .populate("employerId", "companyName logo")
        .lean(),
      effectiveSeekerProfile(String(seeker.userId), seeker),
    ]);

    // The engine the emails use, so the cards here are the jobs the digest would
    // send and carry the same percentage. Only `recommended` jobs (eligible and
    // at or above the admin threshold) may sit under "Recommended for you".
    const pool = await scoreSeekerPool(seekerProfile, recentJobs as Array<Record<string, unknown>>);
    const jobs: FeedJob[] = pool.jobs
      .filter((job) => job.recommended)
      .slice(0, HOME_RECOMMENDED_JOB_COUNT)
      // Fully serialize to plain primitives — populated subdocs still carry
      // Mongoose ObjectIds, which cannot cross the server/client boundary.
      .map((job) => {
        const emp = job.employerId as { _id?: unknown; companyName?: string; logo?: string } | null;
        const loc = job.location as { city?: string; country?: string; isRemote?: boolean } | null;
        const sal = job.salary as { min?: number; max?: number; currency?: string } | null;
        const rawDate = job.createdAt instanceof Date ? job.createdAt : new Date((job.createdAt as string) ?? 0);
        const reqs = job.requirements as { skills?: string[] } | null;
        return {
          _id: String(job._id),
          title: String(job.title ?? ""),
          createdAt: isNaN(rawDate.getTime()) ? new Date(0).toISOString() : rawDate.toISOString(),
          matchScore: job.matchScore,
          employmentType: job.employmentType ? String(job.employmentType) : undefined,
          // The card shows three skills and marks the ones the seeker already
          // has, so both the list and the overlap have to reach the client.
          skills: (reqs?.skills ?? []).map(String),
          matchedSkills: job.matchedSkills,
          location: loc ? { city: loc.city ?? undefined, country: loc.country ?? undefined, isRemote: loc.isRemote ?? false } : undefined,
          salary: sal ? { min: sal.min ?? undefined, max: sal.max ?? undefined, currency: sal.currency ?? undefined } : undefined,
          employerId: emp
            ? { _id: emp._id ? String(emp._id) : undefined, companyName: emp.companyName ?? undefined, logo: emp.logo ?? undefined }
            : undefined,
        };
      });
    const recommendation: RecommendationSummary = {
      threshold: pool.threshold,
      bestScore: pool.bestScore,
      recommendedCount: pool.recommendedCount,
      limitingFactor: pool.limitingFactor ?? null,
    };
    return { jobs, recommendation };
  });
  if (!result.ok) return <Failed id="job-seeker-recommended" title={t("recommendedJobs.forYou")} />;
  return (
    <RecommendedJobsPanel
      locale={locale}
      jobs={JSON.parse(JSON.stringify(result.data.jobs))}
      recommendation={result.data.recommendation}
      hasPreferences={hasJobPreferences(profile)}
    />
  );
}

async function ApplicationsSection({ locale, seeker }: SectionContext) {
  const t = await getTranslations("jobSeekerHome");
  const result = await load("applications", async () => {
    const apps = (await Application.find({ jobSeekerId: seeker._id })
      .select("jobId status createdAt")
      .populate({ path: "jobId", select: "title employerId", populate: { path: "employerId", select: "companyName logo" } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()) as Array<Record<string, unknown>>;
    const rows: AppliedJobSnippet[] = apps
      .map((app) => {
        const job = app.jobId as Record<string, unknown> | null;
        const emp = job?.employerId as { companyName?: string; logo?: string } | null;
        const appliedDate = app.createdAt instanceof Date ? app.createdAt : new Date(String(app.createdAt ?? ""));
        return {
          _id: String(job?._id ?? ""),
          title: String(job?.title ?? ""),
          companyName: emp?.companyName ?? undefined,
          companyLogo: emp?.logo ?? undefined,
          status: String(app.status ?? "applied"),
          appliedAt: isNaN(appliedDate.getTime()) ? undefined : appliedDate.toISOString(),
        };
      })
      .filter((a) => a._id)
      // A seeker can apply to the same job twice (re-apply after rejection), and this
      // list is keyed by job id — keep the first per job or React sees duplicate keys.
      .filter((a, i, arr) => arr.findIndex((x) => x._id === a._id) === i);
    return rows;
  });
  if (!result.ok) return <Failed id="job-seeker-recent-applications" title={t("recentApplications.title")} />;
  return <RecentApplicationsPanel locale={locale} applications={result.data} />;
}

async function InterviewsSection({ locale, seeker, now }: SectionContext) {
  const t = await getTranslations("jobSeekerHome");
  const result = await load("interviews", () => loadUpcomingInterviews(seeker._id, now));
  if (!result.ok) return <Failed id="job-seeker-interviews" title={t("interviews.title")} />;
  return <UpcomingInterviewsPanel locale={locale} interviews={result.data} />;
}

/* ── Page ── */

export default async function JobSeekerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  const sessionUser = session.user as { id: string; name?: string | null; image?: string | null };
  const userId = sessionUser.id;

  await connectDB();

  const seeker = await loadSeeker(userId);

  // No profile yet: the client fetches everything it can from the APIs and
  // paints the same layout.
  if (!seeker) {
    return <JobSeekerHomePage locale={locale} userName={sessionUser.name ?? undefined} userImage={sessionUser.image ?? undefined} />;
  }

  const t = await getTranslations("jobSeekerHome");
  const profile: ProfileData = JSON.parse(JSON.stringify(seeker));
  const { completion, missing } = profileCompletion(profile);
  const context: SectionContext = { locale, seeker, profile, now: new Date() };
  const loading = (section: string) => t("sectionLoading", { section });

  return (
    <HomeGrid
      header={<HomeHeader locale={locale} userName={sessionUser.name ?? undefined} completion={completion} missing={missing} />}
      kpis={
        <Suspense fallback={<KpiStripSkeleton label={loading(t("kpi.title"))} />}>
          <KpiSection {...context} />
        </Suspense>
      }
      status={
        <Suspense fallback={<PanelSkeleton label={loading(t("statusBreakdown.title"))} rows={6} className="h-full" />}>
          <StatusSection {...context} />
        </Suspense>
      }
      recommended={
        <Suspense fallback={<PanelSkeleton label={loading(t("recommendedJobs.forYou"))} rows={8} className="h-full" />}>
          <RecommendedSection {...context} />
        </Suspense>
      }
      applications={
        <Suspense fallback={<PanelSkeleton label={loading(t("recentApplications.title"))} rows={5} className="h-full" />}>
          <ApplicationsSection {...context} />
        </Suspense>
      }
      interviews={
        <Suspense fallback={<PanelSkeleton label={loading(t("interviews.title"))} rows={3} className="h-full" />}>
          <InterviewsSection {...context} />
        </Suspense>
      }
      boost={<ProfileBoostPanel locale={locale} tips={profileBoostTips(profile)} />}
    />
  );
}
