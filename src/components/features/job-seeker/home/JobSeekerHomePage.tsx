"use client";

import Link from "next/link";
import { HOME_RECOMMENDED_JOB_COUNT } from "@/lib/jobRecommendations";
import type { LimitingFactor } from "@/lib/matching/recommend";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  FileText,
  Sparkles,
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
import { SaveJobButton } from "@/components/features/job-seeker/saved/SaveJobButton";
import { useSavedJobIds } from "@/components/features/job-seeker/saved/useSavedJobs";

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
  /** At or above the admin threshold — the jobs the digest email would send. */
  recommended?: boolean;
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


/** What the engine said about the seeker's pool, so an empty list can say why. */
type RecommendationSummary = {
  threshold: number;
  bestScore: number;
  recommendedCount: number;
  limitingFactor: LimitingFactor | null;
};

/** Typed bundle passed from the server component for zero-waterfall hydration. */
export type InitialHomeData = {
  profile: ProfileData;
  stats: DashboardStats;
  /**
   * The first cards of the Jobs page: strong matches first, then the closest
   * others. Absent: the client loads them, so the page paints first. [] still
   * means "no jobs".
   */
  jobs?: FeedJob[];
  recommendation?: RecommendationSummary;
  appliedJobs?: AppliedJobSnippet[];
};

/**
 * Where the "improve" link on an empty or short list should go. Gates the
 * seeker set themselves are preferences; everything else — missing skills,
 * roles, experience, education, or simply a low score — is fixed on the
 * profile. Mirrors the digest email's near-miss link.
 */
const PREFERENCE_FACTORS: ReadonlySet<LimitingFactor> = new Set(["no_location", "country", "salary", "work_mode"]);

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

function initialsOfName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function JobSeekerHomePage({
  locale,
  initialData,
  userName,
  userImage,
}: {
  locale: string;
  initialData?: InitialHomeData;
  userName?: string;
  /** Phones only: the avatar beside the greeting. */
  userImage?: string;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(initialData?.profile ?? null);
  const [stats, setStats] = useState<DashboardStats | null>(initialData?.stats ?? null);
  const [jobs, setJobs] = useState<FeedJob[]>(initialData?.jobs ?? []);
  const [recommendation, setRecommendation] = useState<RecommendationSummary | null>(
    initialData?.recommendation ?? null,
  );
  const [appliedJobs, setAppliedJobs] = useState<AppliedJobSnippet[]>(initialData?.appliedJobs ?? []);
  // If SSR data was provided this is false from the start — no loading flash
  const [loading, setLoading] = useState(!initialData);
  // The server sent the page without job cards; they load after it paints.
  const jobsFromClient = initialData !== undefined && initialData.jobs === undefined;
  const [jobsLoading, setJobsLoading] = useState(jobsFromClient);
  const [jobsFailed, setJobsFailed] = useState(false);
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  // Resolved after mount: the server and the browser can sit in different time
  // zones, so greeting by hour during render would hydrate mismatched.
  const [dayPart, setDayPart] = useState<"morning" | "afternoon" | "evening" | null>(null);

  const t = useTranslations("jobSeekerHome");
  const tCard = useTranslations("jobCard");
  // Phone-only labels reuse strings that already exist elsewhere, so no new keys.
  const tProfileExtra = useTranslations("jobSeekerExtra.profile");
  const tSaved = useTranslations("savedJobs");
  const tEasyApply = useTranslations("easyApply");
  const { ids: savedIds, ready: savedReady } = useSavedJobIds();
  const router = useRouter();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const formatNumber = (value: number) => value.toLocaleString(numberLocale);

  useEffect(() => {
    const hour = new Date().getHours();
    setDayPart(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
  }, []);

  useEffect(() => {
    // The server already ran the shared recommender for this seeker, so its
    // answer is final — including an empty one. Re-fetching it here is what
    // used to paint the "no recommendations yet" panel for a moment before the
    // API's (then looser) answer replaced it.
    if (initialData) {
      setProfile(initialData.profile ?? null);
      setStats(initialData.stats ?? null);
      if (initialData.jobs !== undefined) {
        setJobs(initialData.jobs);
        setRecommendation(initialData.recommendation ?? null);
      }
      setAppliedJobs(initialData.appliedJobs ?? []);
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
          // The list route masks a hidden company for seekers (lib/applications/seekerView.ts).
          jobId?: { _id?: string; title?: string; employerId?: { companyName?: string; logo?: string } | string };
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
            .map((a) => {
              const employer = typeof a.jobId!.employerId === "object" ? a.jobId!.employerId : undefined;
              return {
                _id: String(a.jobId!._id),
                title: String(a.jobId!.title ?? ""),
                companyName: employer?.companyName,
                companyLogo: employer?.logo,
                status: String(a.status ?? "applied"),
                appliedAt: a.createdAt,
              };
            })
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

  // Its own effect, keyed on nothing that changes per render, so the cards are
  // fetched once however often `t` or `initialData` change identity.
  useEffect(() => {
    if (!jobsFromClient) return;
    let active = true;
    fetch(`/api/jobs/recommended?limit=${HOME_RECOMMENDED_JOB_COUNT}&sort=match`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((jobsData) => {
        if (!active) return;
        if (Array.isArray(jobsData?.jobs)) setJobs(jobsData.jobs);
        if (typeof jobsData?.threshold === "number") {
          setRecommendation({
            threshold: jobsData.threshold,
            bestScore: jobsData.bestScore ?? 0,
            recommendedCount: jobsData.strongMatches ?? 0,
            limitingFactor: jobsData.limitingFactor ?? null,
          });
        }
      })
      .catch(() => {
        if (active) setJobsFailed(true);
      })
      .finally(() => {
        if (active) setJobsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jobsFromClient]);

  // First name only, as the super-agent dashboard greets: a full name pushed
  // the hero heading onto a second line on phones.
  const name = userName?.trim().split(/\s+/)[0] || t("defaults.jobSeekerName");

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
  // One end is enough: the top salary chip on Preferences ("₹150k+") saves a
  // minimum only, and that range used to vanish from the chips.
  const salaryMin = profile?.preferredSalary?.min ?? 0;
  const salaryMax = profile?.preferredSalary?.max ?? 0;
  const salaryCurrency = profile?.preferredSalary?.currency;
  const preferredSalary =
    salaryCurrency && (salaryMin > 0 || salaryMax > 0)
      ? salaryMax > 0
        ? `${salaryMin.toLocaleString(numberLocale)}-${salaryMax.toLocaleString(numberLocale)} ${salaryCurrency}`
        : `${salaryMin.toLocaleString(numberLocale)}+ ${salaryCurrency}`
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

  const hasPreferences =
    preferenceChips.length > 0 ||
    Boolean(profile?.preferredRoles?.length || profile?.preferredCountries?.length || profile?.preferredJobType || profile?.preferredSalary?.min);

  const limitingFactor = recommendation?.limitingFactor ?? null;
  const improveOnPreferences = limitingFactor !== null && PREFERENCE_FACTORS.has(limitingFactor);
  const improveHref = `/${locale}/job-seeker/${improveOnPreferences ? "preferences" : "profile"}`;
  // No country known: nothing was matched at all, so the empty state asks for
  // the country instead of quoting a closest match.
  const noLocation = limitingFactor === "no_location";
  const improveLabel = t(
    noLocation
      ? "recommendedJobs.addCountryCta"
      : improveOnPreferences
        ? "recommendedJobs.updatePreferencesCta"
        : "recommendedJobs.improveProfileCta",
  );

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

  // Phone header line: the seeker's role and where they are, when known.
  const phoneSubtitle = [primaryRole, profile?.currentLocation].filter(Boolean).join(" · ") || null;

  const phoneStats: Array<{ href: string; icon: LucideIcon; value: number; label: string }> = [];
  if (recommendation) {
    phoneStats.push({ href: `/${locale}/job-seeker/jobs`, icon: Sparkles, value: recommendation.recommendedCount, label: tEasyApply("recommended") });
  }
  if (typeof stats?.applicationsSent?.count === "number") {
    phoneStats.push({ href: `/${locale}/job-seeker/applications`, icon: FileText, value: stats.applicationsSent.count, label: t("statuses.applied") });
  }
  if (savedReady) {
    phoneStats.push({ href: `/${locale}/job-seeker/saved-jobs`, icon: Bookmark, value: savedIds.size, label: tSaved("saved") });
  }

  return (
    <div className="page-container dashboard-overview-page">
      {/* Search first. This is a job board, so the page opens with the thing
          the seeker came to do rather than with statistics about them. */}
      {/* Phones: no boxed hero. The greeting sits on the page beside the
          avatar, and search, chips and stats follow as their own rows. */}
      <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_-1px_rgba(15,23,42,0.06)] max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-sm:flex-nowrap max-sm:items-center">
          <Avatar className="h-12 w-12 shrink-0 border border-border/60 sm:hidden">
            <AvatarImage src={userImage ?? ""} alt="" className="bg-card object-contain" />
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initialsOfName(userName ?? name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 max-sm:flex-1">
            {/* data-greeting: one step smaller on phones (globals.css). At 24px
                "Good afternoon, <8-letter name>" still wrapped at 375px. */}
            <h1 data-greeting="true" className="heading-page text-foreground text-balance wrap-break-word">
              {dayPart ? t(`greeting.${dayPart}`, { name }) : t("greeting.hello", { name })}
            </h1>
            <p className={cn("mt-1 text-sm text-muted-foreground", phoneSubtitle && "max-sm:hidden")}>{t("greeting.subtitle")}</p>
            {phoneSubtitle && <p className="mt-0.5 truncate text-sm capitalize text-muted-foreground sm:hidden">{phoneSubtitle}</p>}
          </div>
          <Link
            href={`/${locale}/job-seeker/preferences`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline max-sm:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t("greeting.editPreferences")}
          </Link>
        </div>

        {completion < 100 && (
          <Link
            href={`/${locale}/job-seeker/profile`}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xs sm:hidden"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{tProfileExtra("profileCompletion")}</span>
                <span className="text-sm font-semibold text-primary">{formatNumber(completion)}%</span>
              </div>
              <Progress
                value={completion}
                className="mt-2 h-1.5"
                aria-label={t("profileCard.profileCompletenessAria", { completion: formatNumber(completion) })}
              />
              {missingDetails > 0 && (
                <p className="mt-1.5 truncate text-xs text-muted-foreground">{t("profileMini.detailLeft", { count: missingDetails })}</p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
          </Link>
        )}

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
          {/* Visible on phones (a placeholder is not a label); desktop keeps the aria-label. */}
          <label htmlFor="seeker-home-search" className="text-sm font-medium text-foreground sm:hidden">
            {t("search.label")}
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <input
              id="seeker-home-search"
              type="search"
              enterKeyHint="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.label")}
              className="min-h-11 w-full rounded-xl border border-border/70 bg-muted/30 pe-3 ps-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          {/* Phones submit with the keyboard's Search key; the button is desktop-only. */}
          <Button type="submit" className="min-h-11 shrink-0 rounded-xl px-5 shadow-xs max-sm:hidden">
            {t("search.submit")}
          </Button>
        </form>

        {preferenceChips.length > 0 && (
          <div className="scrollbar-none mt-3 flex flex-wrap gap-2 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4">
            {preferenceChips.map((chip, idx) => (
              <Link
                key={`${chip}-${idx}`}
                href={`/${locale}/job-seeker/preferences`}
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full max-sm:min-h-9 border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium capitalize text-muted-foreground transition-all hover:border-primary/40 hover:bg-card hover:text-foreground hover:shadow-xs"
              >
                {chip}
              </Link>
            ))}
          </div>
        )}
        {/* Phones: three small tiles, each a way into its list. A tile shows
            only once its count has actually loaded. */}
        {phoneStats.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
            {phoneStats.map((stat) => (
              <Link
                key={stat.href}
                href={stat.href}
                className="flex min-w-0 flex-col justify-between gap-1 rounded-xl border border-border/70 bg-card px-2.5 py-2"
              >
                <stat.icon className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-lg font-semibold leading-6 text-foreground">{formatNumber(stat.value)}</span>
                <span className="truncate text-xs text-muted-foreground">{stat.label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Phones: just the waiting action, as one full-width banner. */}
      {nextAction && (
        <Link
          href={nextAction.href}
          className="flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm sm:hidden"
        >
          <nextAction.icon className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{nextAction.title}</span>
            <span className="block truncate text-xs text-primary-foreground/85">{nextAction.description}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
        </Link>
      )}

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
          className="shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_-1px_rgba(15,23,42,0.06)] border-border/80 max-sm:hidden"
        />
      )}

      <section aria-labelledby="job-seeker-recommended" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-sm:flex-nowrap">
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

        {(homeDataError || jobsFailed) && (
          <div className="mb-3 rounded-2xl border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] px-4 py-3 text-sm text-foreground">
            {homeDataError ?? t("messages.homeDataError")}
          </div>
        )}

        {loading || jobsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.slice(0, HOME_RECOMMENDED_JOB_COUNT).map((job, index, shown) => (
              <Fragment key={job._id || `job-${index}`}>
                {/* Where the strong matches end, as on the Jobs page. */}
                {index > 0 && !job.recommended && shown[index - 1].recommended && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("recommendedJobs.moreJobs")}
                    </span>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                )}
                <JobSummaryCard
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
                  bookmark={<SaveJobButton jobId={job._id} />}
                  actions={
                    <>
                      <SaveJobButton jobId={job._id} className="max-sm:hidden" />
                      <Button asChild size="sm" className="min-h-11 rounded-xl px-4 max-sm:min-h-10 max-sm:px-3 max-sm:text-xs">
                        <Link href={`/${locale}/job-seeker/jobs/${job._id}`}>
                          {tCard("viewJob")}
                          <ArrowRight className="ms-1.5 h-4 w-4 max-sm:hidden" aria-hidden />
                        </Link>
                      </Button>
                    </>
                  }
                />
              </Fragment>
            ))}
            {/* No strong match anywhere in the pool: the cards are the closest
                jobs, so say so and name what holds the score back. The "score"
                blocker is left out — its copy promises an empty list. */}
            {recommendation?.recommendedCount === 0 && (
              <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 pt-3 text-sm text-muted-foreground">
                <p>
                  {t("recommendedJobs.closestNote")}
                  {limitingFactor && limitingFactor !== "score" && ` ${t(`recommendedJobs.blockers.${limitingFactor}`)}`}
                </p>
                <Link href={improveHref} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                  {improveLabel}
                </Link>
              </div>
            )}
          </div>
        ) : hasPreferences ? (
          // Nothing open in the seeker's countries (or they applied to all of
          // it) — a job-supply answer, not a profile one.
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/80 px-4 py-8 text-center shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] sm:px-6 sm:py-12">
            <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Search className="h-6 w-6" aria-hidden />
            </div>
            <div className="text-lg font-semibold">
              {t(noLocation ? "recommendedJobs.noLocationTitle" : "recommendedJobs.noJobsTitle")}
            </div>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              {t(noLocation ? "recommendedJobs.blockers.no_location" : "recommendedJobs.noJobsBody")}
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button asChild className="min-h-11 rounded-full px-6 shadow-sm">
                <Link href={`/${locale}/job-seeker/preferences`}>
                  {t(noLocation ? "recommendedJobs.addCountryCta" : "recommendedJobs.updatePreferencesCta")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11 rounded-full px-6">
                <Link href={`/${locale}/job-seeker/jobs`}>
                  <Search className="me-2 h-4 w-4" aria-hidden />
                  {t("recommendedJobs.browseJobsCta")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/80 px-4 py-8 text-center shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] sm:px-6 sm:py-12">
            <div className="text-lg font-semibold">{t("recommendedJobs.emptyTitle")}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t("recommendedJobs.emptyBody")}</p>
            <Link
              href={`/${locale}/job-seeker/preferences`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm"
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-sm:flex-nowrap">
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
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_-1px_rgba(15,23,42,0.06)]">
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
                  key={`${app._id || "app"}-${index}`}
                  href={`/${locale}/job-seeker/applications`}
                  className={cn(
                    "flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:px-4",
                    index > 0 && "border-t border-border/60"
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0 border border-border/60 bg-muted/20">
                    <AvatarImage src={app.companyLogo ?? ""} alt={app.companyName ?? app.title} className="bg-card object-contain p-1" />
                    <AvatarFallback className="bg-primary/[0.08] text-xs font-semibold text-primary">
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
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background p-4 max-sm:hidden">
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
