"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getLocalizedCountryName } from "@/lib/i18n/locations";
import { cn } from "@/lib/utils";
import { DashboardNextAction } from "@/components/shared/DashboardOverview";
import { JobSummaryCard } from "@/components/features/job-seeker/JobSummaryCard";

/**
 * The seeker's home page.
 *
 * It used to carry nineteen information groups — a preferences header with
 * three competing buttons, a ranked next action plus two secondary action
 * strips, a four-tile stat block, recommended jobs, an "already applied" panel
 * nested inside them, a five-item priority-action checklist, a profile card
 * repeating the completeness number, an AI daily-insights list and an
 * auto-opening AI drawer. Someone arriving to look for work met a status
 * dashboard about themselves.
 *
 * What survives answers the four questions a job seeker actually opens this
 * page with: what am I searching for, is anything waiting on me, which jobs
 * should I look at, and is anything holding my matches back.
 */

type FeedJob = {
  _id: string;
  title: string;
  createdAt: string;
  matchScore: number;
  employmentType?: string;
  skills?: string[];
  matchedSkills?: string[];
  location?: { city?: string; country?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string };
  employerId?: { _id?: string; companyName?: string; logo?: string } | null;
};

type AppliedJobSnippet = {
  _id: string;
  title: string;
  companyName?: string;
  companyLogo?: string;
  status: string;
  appliedAt?: string;
};

type DashboardStats = {
  applicationsSent?: { count: number };
  upcomingInterviews?: { count: number };
  savedJobs?: { count: number };
  recruiterViews?: { total: number };
  pendingOffers?: { count: number };
  unreadMessages?: { count: number };
};

type ProfileData = {
  summary?: string;
  profileCompleteness?: number;
  preferredRoles?: string[];
  preferredCountries?: string[];
  preferredJobType?: string;
  preferredSalary?: { min?: number; max?: number; currency?: string };
  skills?: Array<string | { name?: string }>;
  experience?: Array<unknown>;
  education?: Array<unknown>;
  languages?: Array<unknown>;
  cvFileUrl?: string;
  cv?: { originalUrl?: string };
  userId?: string;
  nationality?: string;
  currentLocation?: string;
  linkedin?: string;
  socialLinks?: Array<{ label?: string; url?: string }>;
};

type NextActionItem = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge: string;
};

/**
 * How many recommended jobs the home page shows.
 *
 * The server component slices its scored list to this number and the client
 * fetch fallback asks for the same count, so the page never ships jobs it will
 * not paint. Change it here and both sides follow.
 */
export const HOME_RECOMMENDED_JOB_COUNT = 4;

/** Typed bundle passed from the server component for zero-waterfall hydration. */
export type InitialHomeData = {
  profile: ProfileData;
  stats: DashboardStats;
  jobs: FeedJob[];
  appliedJobs?: AppliedJobSnippet[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timeAgo(iso: string, locale: string, translate: any): string {
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const formatRelativeValue = (value: number) => value.toLocaleString(numberLocale);
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return translate("time.justNow");
  if (hours < 24) return translate("time.hoursAgo", { value: formatRelativeValue(hours) });
  const days = Math.floor(hours / 24);
  if (days < 7) return translate("time.daysAgo", { value: formatRelativeValue(days) });
  const weeks = Math.floor(days / 7);
  return translate("time.weeksAgo", { value: formatRelativeValue(weeks) });
}

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
  const [appliedJobs, setAppliedJobs] = useState<AppliedJobSnippet[]>(initialData?.appliedJobs ?? []);
  // If SSR data was provided this is false from the start — no loading flash
  const [loading, setLoading] = useState(!initialData);
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  // Resolved after mount: the server and the browser can sit in different time
  // zones, so greeting by hour during render would hydrate mismatched.
  const [dayPart, setDayPart] = useState<"morning" | "afternoon" | "evening" | null>(null);

  const t = useTranslations("jobSeekerHome");
  const tCard = useTranslations("jobCard");
  const router = useRouter();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const formatNumber = (value: number) => value.toLocaleString(numberLocale);

  useEffect(() => {
    const hour = new Date().getHours();
    setDayPart(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
  }, []);

  useEffect(() => {
    // SSR primed — skip the initial data fetch entirely
    if (initialData) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      try {
        setHomeDataError(null);
        const [profileRes, statsRes, jobsRes, appsRes] = await Promise.all([
          fetch("/api/job-seeker/profile"),
          fetch("/api/dashboard/stats"),
          fetch(`/api/jobs/recommended?limit=${HOME_RECOMMENDED_JOB_COUNT}&sort=match`),
          fetch("/api/applications?limit=5&page=1"),
        ]);

        const [profileData, statsData, jobsData, appsData] = await Promise.all([
          profileRes.ok ? profileRes.json() : null,
          statsRes.ok ? statsRes.json() : null,
          jobsRes.ok ? jobsRes.json() : null,
          appsRes.ok ? appsRes.json() : null,
        ]);

        if (!active) return;
        setProfile(profileData);
        setStats(statsData);
        setJobs(jobsData?.jobs ?? []);
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
            .slice(0, 5)
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

  const name = userName ?? t("defaults.jobSeekerName");

  // Completeness uses the same formula as the profile page. It is kept as a
  // list rather than a sum so the prompt can say how many details are missing
  // without a second, drifting definition of "done".
  const profileChecks: Array<{ weight: number; done: boolean }> = [
    { weight: 10, done: Boolean(profile?.userId) },
    { weight: 10, done: Boolean(profile?.nationality) },
    { weight: 5, done: Boolean(profile?.currentLocation) },
    { weight: 10, done: Boolean(profile?.summary) },
    { weight: 20, done: (profile?.skills?.length ?? 0) > 0 },
    { weight: 20, done: (profile?.experience?.length ?? 0) > 0 },
    { weight: 15, done: (profile?.education?.length ?? 0) > 0 },
    { weight: 5, done: (profile?.languages?.length ?? 0) > 0 },
    {
      weight: 5,
      done: Boolean(
        profile?.linkedin || profile?.socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin")
      ),
    },
  ];
  const completion = profile
    ? Math.min(100, profileChecks.reduce((sum, check) => sum + (check.done ? check.weight : 0), 0))
    : 0;
  const missingDetails = profile ? profileChecks.filter((check) => !check.done).length : 0;

  // Pick the most relevant role — the one matching the most recommended job titles
  const primaryRole = useMemo(() => {
    const roles = profile?.preferredRoles ?? [];
    if (roles.length <= 1) return roles[0] ?? null;
    const counts = roles.map((role) => {
      const needle = role.toLowerCase();
      return jobs.filter((j) => j.title.toLowerCase().includes(needle)).length;
    });
    const maxCount = Math.max(...counts);
    return roles[maxCount > 0 ? counts.indexOf(maxCount) : 0];
  }, [profile?.preferredRoles, jobs]);

  const preferredLocation = profile?.preferredCountries
    ?.slice(0, 2)
    .map((country) => getLocalizedCountryName(country, locale))
    .join(", ");
  const preferredSalary =
    profile?.preferredSalary?.min && profile?.preferredSalary?.max && profile?.preferredSalary?.currency
      ? `${profile.preferredSalary.min.toLocaleString(numberLocale)}-${profile.preferredSalary.max.toLocaleString(numberLocale)} ${profile.preferredSalary.currency}`
      : null;

  /**
   * The seeker's live preferences, shown as chips under the search box.
   *
   * They used to be the page's <h1> and two sub-lines, which spent the top of
   * the screen restating settings the seeker chose themselves. As chips they
   * cost one row, and each is a link to the page that owns them — so
   * preferences have exactly one home.
   */
  const preferenceChips = [
    primaryRole,
    preferredLocation || null,
    profile?.preferredJobType ? profile.preferredJobType.replace(/_/g, " ") : null,
    preferredSalary,
  ].filter((chip): chip is string => Boolean(chip));

  const interviewCount = stats?.upcomingInterviews?.count ?? 0;
  const pendingOfferCount = stats?.pendingOffers?.count ?? 0;
  const unreadMessageCount = stats?.unreadMessages?.count ?? 0;

  /**
   * Only things genuinely waiting on the seeker qualify.
   *
   * The old ranked list also carried "check your application progress" and
   * "browse jobs", so the page always claimed something was urgent even when
   * nothing was. Profile gaps are not urgent either — they are the completeness
   * prompt at the bottom of the page.
   */
  const pendingActions: NextActionItem[] = [];
  if (pendingOfferCount > 0) {
    pendingActions.push({
      title: t("taskFirst.respondToOfferTitle", { count: formatNumber(pendingOfferCount) }),
      description: t("taskFirst.respondToOfferDescription"),
      href: `/${locale}/job-seeker/offers`,
      icon: CheckCircle2,
      badge: t("taskFirst.urgent"),
    });
  }
  if (interviewCount > 0) {
    pendingActions.push({
      title: t("taskFirst.interviewTitle", { count: formatNumber(interviewCount) }),
      description: t("taskFirst.interviewDescription"),
      href: `/${locale}/job-seeker/interviews`,
      icon: CalendarDays,
      badge: t("taskFirst.urgent"),
    });
  }
  if (unreadMessageCount > 0) {
    pendingActions.push({
      title: t("taskFirst.checkMessagesTitle", { count: formatNumber(unreadMessageCount) }),
      description: t("taskFirst.checkMessagesDescription"),
      href: `/${locale}/job-seeker/messages`,
      icon: MessageSquare,
      badge: t("taskFirst.medium"),
    });
  }
  const nextAction = pendingActions[0];

  return (
    <div className="page-container dashboard-overview-page">
      {/* Search first. This is a job board, so the page opens with the thing
          the seeker came to do rather than with statistics about them. */}
      <section className="rounded-2xl border border-border/70 bg-background p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="heading-page text-foreground">
              {dayPart ? t(`greeting.${dayPart}`, { name }) : t("greeting.hello", { name })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("greeting.subtitle")}</p>
          </div>
          <Link
            href={`/${locale}/job-seeker/preferences`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t("greeting.editPreferences")}
          </Link>
        </div>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = searchInput.trim();
            router.push(
              query
                ? `/${locale}/job-seeker/jobs?search=${encodeURIComponent(query)}`
                : `/${locale}/job-seeker/jobs`
            );
          }}
          className="mt-4 flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.label")}
              className="min-h-11 w-full rounded-xl border border-border/70 bg-background pe-3 ps-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          <Button type="submit" className="min-h-11 shrink-0 rounded-xl px-5">
            {t("search.submit")}
          </Button>
        </form>

        {preferenceChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {preferenceChips.map((chip) => (
              <Link
                key={chip}
                href={`/${locale}/job-seeker/preferences`}
                className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium capitalize text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                {chip}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* At most one, and only when something is really waiting. */}
      {nextAction && (
        <DashboardNextAction
          headingId="job-seeker-next-action"
          title={t("taskFirst.recommendedNext")}
          description={t("taskFirst.nextDescription")}
          actionTitle={nextAction.title}
          actionDescription={nextAction.description}
          actionLabel={t("taskFirst.openAction")}
          href={nextAction.href}
          icon={nextAction.icon}
          badge={nextAction.badge}
        />
      )}

      <section aria-labelledby="job-seeker-recommended" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="job-seeker-recommended" className="heading-section font-semibold tracking-tight">
            {t("recommendedJobs.eyebrow")}
          </h2>
          <Link
            href={`/${locale}/job-seeker/jobs`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t("recommendedJobs.viewAll")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {homeDataError && (
          <div className="mb-3 rounded-2xl border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] px-4 py-3 text-sm text-foreground">
            {homeDataError}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.slice(0, HOME_RECOMMENDED_JOB_COUNT).map((job) => (
              <JobSummaryCard
                key={job._id}
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
                  company: job.employerId
                    ? { _id: job.employerId._id, name: job.employerId.companyName, logo: job.employerId.logo }
                    : null,
                }}
                actions={
                  <Button asChild size="sm" className="min-h-11 rounded-xl px-4">
                    <Link href={`/${locale}/job-seeker/jobs/${job._id}`}>
                      {tCard("viewJob")}
                      <ArrowRight className="ms-1.5 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                }
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center sm:px-6 sm:py-12">
            <div className="text-lg font-semibold">{t("recommendedJobs.emptyTitle")}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t("recommendedJobs.emptyBody")}</p>
            <Link
              href={`/${locale}/job-seeker/preferences`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              {t("recommendedJobs.emptyCta")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </section>

      {/* Three rows, then the tracker takes over. This used to be an "already
          applied" panel nested inside the recommendations card, where it read
          as part of the recommendations. */}
      {appliedJobs.length > 0 && (
        <section aria-labelledby="job-seeker-recent-applications" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="job-seeker-recent-applications" className="heading-section font-semibold tracking-tight">
              {t("recentApplications.title")}
            </h2>
            <Link
              href={`/${locale}/job-seeker/applications`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              {t("recentApplications.viewAll")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-background">
            {appliedJobs.slice(0, 3).map((app, index) => {
              const appInitials = (app.companyName ?? app.title)
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const statusLabel =
                app.status === "selected"
                  ? t("statuses.selected")
                  : app.status === "interview_scheduled"
                  ? t("statuses.interview")
                  : app.status === "rejected"
                  ? t("statuses.rejected")
                  : t("statuses.applied");
              const statusClass =
                app.status === "selected"
                  ? "text-[hsl(var(--status-selected))] bg-[hsl(var(--status-selected-bg))] border-[hsl(var(--status-selected)/0.2)]"
                  : app.status === "interview_scheduled"
                  ? "text-[hsl(var(--status-interview))] bg-[hsl(var(--status-interview-bg))] border-[hsl(var(--status-interview)/0.2)]"
                  : app.status === "rejected"
                  ? "text-[hsl(var(--status-rejected))] bg-[hsl(var(--status-rejected-bg))] border-[hsl(var(--status-rejected)/0.2)]"
                  : "text-muted-foreground bg-muted/30 border-border/60";
              return (
                <Link
                  key={app._id}
                  href={`/${locale}/job-seeker/applications`}
                  className={cn(
                    "flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:px-4",
                    index > 0 && "border-t border-border/60"
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0 rounded-xl border border-border/60 bg-muted/20">
                    <AvatarImage src={app.companyLogo ?? ""} alt={app.companyName ?? app.title} />
                    <AvatarFallback className="rounded-xl bg-primary/[0.08] text-xs font-semibold text-primary">
                      {appInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{app.title}</p>
                    {app.companyName && (
                      <p className="truncate text-xs text-muted-foreground">{app.companyName}</p>
                    )}
                  </div>
                  {app.appliedAt && (
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                      {timeAgo(app.appliedAt, locale, t)}
                    </span>
                  )}
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                    {statusLabel}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* One line about the profile, and only while it is worth acting on. The
          number used to appear as a sidebar card, a progress bar and a five-row
          checklist on this page alone. */}
      {completion < 100 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background p-4">
          <div className="min-w-[200px] flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{t("profileMini.title")}</span>
              <span className="text-sm font-semibold text-primary">{formatNumber(completion)}%</span>
            </div>
            <Progress
              value={completion}
              className="mt-2"
              aria-label={t("profileCard.profileCompletenessAria", { completion: formatNumber(completion) })}
            />
            {missingDetails > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("profileMini.detailLeft", { count: missingDetails })}
              </p>
            )}
          </div>
          <Button asChild variant="outline" className="min-h-11 shrink-0 rounded-xl px-4">
            <Link href={`/${locale}/job-seeker/profile`}>
              {t("profileMini.improve")}
              <ArrowRight className="ms-1.5 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}
