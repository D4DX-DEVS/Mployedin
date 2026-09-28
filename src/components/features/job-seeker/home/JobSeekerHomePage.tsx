"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { HOME_RECOMMENDED_JOB_COUNT } from "@/lib/jobRecommendations";
import { EMPTY_STATUS_BREAKDOWN } from "@/lib/jobSeeker/dashboard/status";
import { HomeGrid } from "./home-grid";
import { HomeHeader } from "./home-header";
import { SeekerKpiStrip } from "./kpi-strip";
import { ApplicationStatusPanel } from "./status-panel";
import { RecommendedJobsPanel } from "./recommended-panel";
import { RecentApplicationsPanel } from "./applications-panel";
import { UpcomingInterviewsPanel } from "./interviews-panel";
import { ProfileBoostPanel } from "./boost-panel";
import { hasJobPreferences, profileBoostTips, profileCompletion } from "./profile-checks";
import type {
  AppliedJobSnippet,
  DashboardStats,
  FeedJob,
  InitialHomeData,
  ProfileData,
  RecommendationSummary,
  StatusBreakdown,
  UpcomingInterview,
} from "./types";

export type { InitialHomeData } from "./types";

/**
 * Client fallback for the seeker home.
 *
 * The server page streams every section itself when the seeker has a profile.
 * This component covers the other case — no profile yet — by fetching what the
 * APIs can give and painting the same layout, and it is what the tests render
 * with `initialData`. When `initialData` is present nothing is fetched: the
 * server already ran the recommender and its answer, including an empty one,
 * is final.
 */
export function JobSeekerHomePage({
  locale,
  initialData,
  userName,
}: {
  locale: string;
  initialData?: InitialHomeData;
  userName?: string;
  /** Kept for call-site compatibility; the home page no longer renders an avatar. */
  userImage?: string;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(initialData?.profile ?? null);
  const [stats, setStats] = useState<DashboardStats | null>(initialData?.stats ?? null);
  const [jobs, setJobs] = useState<FeedJob[]>(initialData?.jobs ?? []);
  const [recommendation, setRecommendation] = useState<RecommendationSummary | null>(initialData?.recommendation ?? null);
  const [appliedJobs, setAppliedJobs] = useState<AppliedJobSnippet[]>(initialData?.appliedJobs ?? []);
  const [interviews, setInterviews] = useState<UpcomingInterview[]>(initialData?.interviews ?? []);
  // If SSR data was provided this is false from the start — no loading flash
  const [loading, setLoading] = useState(!initialData);
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const t = useTranslations("jobSeekerHome");

  useEffect(() => {
    if (initialData) {
      setProfile(initialData.profile ?? null);
      setStats(initialData.stats ?? null);
      setJobs(initialData.jobs ?? []);
      setRecommendation(initialData.recommendation ?? null);
      setAppliedJobs(initialData.appliedJobs ?? []);
      setInterviews(initialData.interviews ?? []);
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      try {
        setHomeDataError(null);
        // Reached only when the page rendered without SSR data (no seeker
        // profile yet), so everything is fetched.
        const [profileRes, statsRes, jobsRes, appsRes] = await Promise.all([
          fetch("/api/job-seeker/profile"),
          fetch("/api/dashboard/stats"),
          fetch(`/api/jobs/recommended?limit=${HOME_RECOMMENDED_JOB_COUNT}&sort=match&recommended=true`),
          fetch("/api/applications?limit=5&page=1"),
        ]);

        const [profileData, statsData, jobsData, appsData] = await Promise.all([
          profileRes.ok ? profileRes.json() : null,
          statsRes.ok ? statsRes.json() : null,
          jobsRes.ok ? jobsRes.json() : null,
          appsRes.ok ? appsRes.json() : null,
        ]);

        if (!active) return;
        if (profileData) setProfile(profileData);
        if (statsData) setStats(statsData);
        if (jobsData?.jobs) setJobs(jobsData.jobs);
        if (jobsData && typeof jobsData.threshold === "number") {
          setRecommendation({
            threshold: jobsData.threshold,
            bestScore: jobsData.bestScore ?? 0,
            recommendedCount: jobsData.strongMatches ?? 0,
            limitingFactor: jobsData.limitingFactor ?? null,
          });
        }
        const rawApps: Array<{
          jobId?: { _id?: string; title?: string; employer?: { companyName?: string; logo?: string } };
          status?: string;
          createdAt?: string;
        }> = appsData?.applications ?? [];
        // Two applications can point at the same job, which produced duplicate
        // React keys in the applied list. Keep the first per job.
        const seenJobIds = new Set<string>();
        setAppliedJobs(
          rawApps
            .filter((a) => {
              const id = a.jobId?._id ? String(a.jobId._id) : null;
              if (!id || seenJobIds.has(id)) return false;
              seenJobIds.add(id);
              return true;
            })
            .map((a) => ({
              _id: String(a.jobId!._id),
              title: String(a.jobId!.title ?? ""),
              companyName: a.jobId!.employer?.companyName,
              companyLogo: a.jobId!.employer?.logo,
              status: String(a.status ?? "applied"),
              appliedAt: a.createdAt,
            }))
            .slice(0, 5),
        );
      } catch {
        if (!active) return;
        setHomeDataError(t("messages.homeDataError"));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [initialData, t]);

  const { completion, missing } = useMemo(() => profileCompletion(profile), [profile]);
  const tips = useMemo(() => profileBoostTips(profile), [profile]);
  const breakdown: StatusBreakdown = stats?.statusBreakdown ?? EMPTY_STATUS_BREAKDOWN;

  return (
    <HomeGrid
      header={<HomeHeader locale={locale} userName={userName} completion={profile ? completion : null} missing={missing} />}
      notice={
        homeDataError && (
          <div
            role="alert"
            className="rounded-2xl border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] px-4 py-3 text-sm text-foreground"
          >
            {homeDataError}
          </div>
        )
      }
      kpis={<SeekerKpiStrip locale={locale} stats={stats ?? {}} />}
      status={<ApplicationStatusPanel locale={locale} breakdown={breakdown} />}
      recommended={
        <RecommendedJobsPanel locale={locale} jobs={jobs} recommendation={recommendation} hasPreferences={hasJobPreferences(profile)} loading={loading} />
      }
      applications={<RecentApplicationsPanel locale={locale} applications={appliedJobs} />}
      interviews={<UpcomingInterviewsPanel locale={locale} interviews={interviews} />}
      boost={<ProfileBoostPanel locale={locale} tips={tips} />}
    />
  );
}
