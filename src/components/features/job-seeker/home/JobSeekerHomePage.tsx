"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCircle,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type FeedJob = {
  _id: string;
  title: string;
  createdAt: string;
  matchScore: number;
  location?: { city?: string; country?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string };
  employerId?: { companyName?: string; logo?: string } | null;
};

type AppliedJobSnippet = {
  _id: string;
  title: string;
  companyName?: string;
  companyLogo?: string;
  status: string;
};

type DashboardStats = {
  applicationsSent?: { count: number };
  upcomingInterviews?: { count: number };
  savedJobs?: { count: number };
  recruiterViews?: { total: number };
};

type ProfileData = {
  summary?: string;
  profileCompleteness?: number;
  preferredRoles?: string[];
  preferredCountries?: string[];
  preferredSalary?: { min?: number; max?: number; currency?: string };
  skills?: Array<{ name?: string }>;
  experience?: Array<unknown>;
  cvFileUrl?: string;
  cv?: { originalUrl?: string };
};

type SuggestionItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

/** Typed bundle passed from the server component for zero-waterfall hydration. */
export type InitialHomeData = {
  profile: ProfileData;
  stats: DashboardStats;
  jobs: FeedJob[];
  appliedJobs?: AppliedJobSnippet[];
};

function formatSalary(job: FeedJob) {
  const salary = job.salary;
  if (!salary?.min || !salary?.max || !salary.currency) return null;
  return `${salary.min.toLocaleString("en-US")}-${salary.max.toLocaleString("en-US")} ${salary.currency}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function buildSuggestions(profile: ProfileData | null) {
  const suggestions: SuggestionItem[] = [];

  if (!profile?.cvFileUrl && !profile?.cv?.originalUrl) {
    suggestions.push({
      id: "resume",
      title: "Upload your resume",
      body: "Recruiters shortlist complete profiles faster. Add your CV so we can improve job matching.",
      href: "cv",
      cta: "Upload resume",
    });
  }

  if ((profile?.preferredRoles?.length ?? 0) === 0 || (profile?.preferredCountries?.length ?? 0) === 0) {
    suggestions.push({
      id: "preferences",
      title: "Sharpen your job preferences",
      body: "Add role and location preferences to make recommendations much closer to what you want.",
      href: "preferences",
      cta: "Set preferences",
    });
  }

  if ((profile?.skills?.length ?? 0) < 5) {
    suggestions.push({
      id: "skills",
      title: "Add a few more skills",
      body: "Skills are one of the strongest ranking signals for matches and recruiter discovery.",
      href: "skills",
      cta: "Update skills",
    });
  }

  if ((profile?.experience?.length ?? 0) === 0) {
    suggestions.push({
      id: "experience",
      title: "Complete your work history",
      body: "Experience helps us surface better roles and makes your profile stronger for employers.",
      href: "profile",
      cta: "Complete profile",
    });
  }

  return suggestions.slice(0, 3);
}

export function JobSeekerHomePage({
  locale,
  initialData,
}: {
  locale: string;
  initialData?: InitialHomeData;
}) {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(initialData?.profile ?? null);
  const [stats, setStats] = useState<DashboardStats | null>(initialData?.stats ?? null);
  const [jobs, setJobs] = useState<FeedJob[]>(initialData?.jobs ?? []);
  const [appliedJobs, setAppliedJobs] = useState<AppliedJobSnippet[]>(initialData?.appliedJobs ?? []);
  // If SSR data was provided this is false from the start — no loading flash
  const [loading, setLoading] = useState(!initialData);
  const [guideOpen, setGuideOpen] = useState(false);
  const [aiInsights, setAiInsights] = useState<Array<{ type: string; title: string; message: string; action?: string }>>([]);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsKey, setAiInsightsKey] = useState(0);
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  const [guideAnnouncement, setGuideAnnouncement] = useState("");
  const guidePanelRef = useRef<HTMLDivElement | null>(null);
  const guideTriggerRef = useRef<HTMLElement | null>(null);

  const openGuide = () => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      guideTriggerRef.current = document.activeElement;
    }
    setGuideOpen(true);
  };

  const closeGuide = () => {
    setGuideOpen(false);
  };

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
          fetch("/api/jobs/recommended?limit=6&sort=match"),
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
        const rawApps: Array<{ jobId?: { _id?: string; title?: string; employer?: { companyName?: string; logo?: string } }; status?: string }> = appsData?.applications ?? [];
        setAppliedJobs(
          rawApps
            .filter((a) => a.jobId?._id)
            .map((a) => ({
              _id: String(a.jobId!._id),
              title: String(a.jobId!.title ?? ""),
              companyName: a.jobId!.employer?.companyName,
              companyLogo: a.jobId!.employer?.logo,
              status: String(a.status ?? "applied"),
            }))
            .slice(0, 5)
        );
      } catch {
        if (!active) return;
        setHomeDataError("We couldn't refresh your latest dashboard data. Try again in a moment.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    try {
      const seen = window.sessionStorage.getItem("job-seeker-home-guide-seen");
      if (!seen) {
        setGuideAnnouncement("AI suggestions panel opened.");
        setGuideOpen(true);
        window.sessionStorage.setItem("job-seeker-home-guide-seen", "1");
      }
    } catch {
      setGuideAnnouncement("AI suggestions panel opened.");
      setGuideOpen(true);
    }

    return () => {
      active = false;
    };
  }, [initialData]);

  // Fetch real AI insights (cached per day in sessionStorage)
  useEffect(() => {
    const cacheKey = `ai_insights_job_seeker_${new Date().toDateString()}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached && aiInsightsKey === 0) {
        setAiInsights(JSON.parse(cached));
        return;
      }
    } catch {
      // Ignore storage access errors and continue with a fresh fetch.
    }

    let active = true;
    const load = async () => {
      setAiInsightsLoading(true);
      try {
        setAiInsightsError(null);
        const res = await fetch("/api/ai/daily-insights");
        if (!res.ok) {
          throw new Error("Failed to load AI insights");
        }
        if (active) {
          const data = await res.json();
          const items = data.insights ?? [];
          setAiInsights(items);
          sessionStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } catch {
        if (!active) return;
        setAiInsightsError("AI insights are temporarily unavailable.");
      } finally {
        if (active) setAiInsightsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [aiInsightsKey]);

  useEffect(() => {
    if (!guideOpen) {
      guideTriggerRef.current?.focus();
      guideTriggerRef.current = null;
      return;
    }

    guidePanelRef.current?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGuideOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = guidePanelRef.current;
      if (!panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("aria-hidden"));

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [guideOpen]);

  const name = session?.user?.name ?? "Job Seeker";
  const image = session?.user?.image ?? "";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const completion = profile?.profileCompleteness ?? 0;
  const preferredRole = profile?.preferredRoles?.[0] ?? "Add your target role";
  const preferredLocation = profile?.preferredCountries?.slice(0, 2).join(", ") || "Add preferred locations";
  const preferredSalary =
    profile?.preferredSalary?.min && profile?.preferredSalary?.max && profile?.preferredSalary?.currency
      ? `${profile.preferredSalary.min.toLocaleString("en-US")}-${profile.preferredSalary.max.toLocaleString("en-US")} ${profile.preferredSalary.currency}`
      : "Set your salary range";

  const suggestions = useMemo(() => buildSuggestions(profile), [profile]);
  const applicationCount = stats?.applicationsSent?.count ?? 0;
  const savedJobsCount = stats?.savedJobs?.count ?? 0;
  const interviewCount = stats?.upcomingInterviews?.count ?? 0;
  const profileViewCount = stats?.recruiterViews?.total ?? 0;
  const quickLinks = [
    {
      label: "Applications",
      href: `/${locale}/job-seeker/applications`,
      icon: FileText,
      value: String(stats?.applicationsSent?.count ?? 0),
    },
    {
      label: "Interviews",
      href: `/${locale}/job-seeker/interviews`,
      icon: CalendarDays,
      value: String(stats?.upcomingInterviews?.count ?? 0),
    },
    {
      label: "Preferences",
      href: `/${locale}/job-seeker/preferences`,
      icon: Target,
      value: "Edit",
    },
  ];
  const topSkills = (profile?.skills ?? [])
    .map((skill) => skill.name?.trim())
    .filter((skill): skill is string => Boolean(skill))
    .slice(0, 3);
  const activeMatchesCountLabel = jobs.length === 1 ? "1 active match" : `${jobs.length} active matches`;
  const nextStepsLabel = suggestions.length === 1 ? "1 next step queued" : `${suggestions.length} next steps queued`;

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-[28px] border border-border/70 bg-background px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:px-6 sm:py-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{preferredRole}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{preferredLocation}</span>
                  <span aria-hidden="true">•</span>
                  <span>{preferredSalary}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild className="h-11 rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/jobs`}>
                    <Search className="mr-2 h-4 w-4" />
                    Browse matching jobs
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/preferences`}>
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Refine
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={openGuide}
                  className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Sparkles className="h-4 w-4" />
                  AI suggestions
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{activeMatchesCountLabel}</span>
              <span>
                <span className="font-semibold text-foreground">{applicationCount}</span> applications
              </span>
              <span>
                <span className="font-semibold text-foreground">{savedJobsCount}</span> saved jobs
              </span>
              <span>
                <span className="font-semibold text-foreground">{interviewCount}</span> interviews
              </span>
              <span>
                <span className="font-semibold text-foreground">{profileViewCount}</span> profile views
              </span>
              {suggestions.length > 0 && (
                <button type="button" onClick={openGuide} className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80">
                  {nextStepsLabel}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.72fr)_340px] xl:items-start">
          <div className="space-y-5">
            <section className="card-base rounded-[28px] p-5 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Recommended jobs</div>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">Best-fit roles from your live profile signal</h2>
                </div>
                <Link href={`/${locale}/job-seeker/jobs`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  View all jobs
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {homeDataError && (
                <div className="mb-4 rounded-[20px] border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] px-4 py-3 text-sm text-foreground">
                  {homeDataError}
                </div>
              )}

              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="h-36 animate-pulse rounded-[24px] bg-muted/60" />
                  ))}
                </div>
              ) : jobs.length > 0 ? (
                <div className="space-y-3">
                  {jobs.map((job) => {
                    const companyName = job.employerId?.companyName ?? "Company";
                    const companyInitials = companyName
                      .trim()
                      .split(" ")
                      .filter(Boolean)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const remoteLabel = job.location?.isRemote
                      ? "Remote"
                      : [job.location?.city, job.location?.country].filter(Boolean).join(", ") || "Location flexible";
                    const fresh = Date.now() - new Date(job.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;

                    return (
                      <Link
                        key={job._id}
                        href={`/${locale}/job-seeker/jobs/${job._id}`}
                        className="group block rounded-[22px] border border-border/60 bg-background px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_32px_rgba(15,23,42,0.06)] sm:px-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 gap-4">
                            <Avatar className="h-12 w-12 rounded-2xl border border-border/60 bg-muted/20">
                              <AvatarImage src={job.employerId?.logo ?? ""} alt={companyName} />
                              <AvatarFallback className="rounded-2xl bg-primary/[0.08] font-semibold text-primary">
                                {companyInitials}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                {fresh && (
                                  <span className="rounded-full border border-primary/15 bg-primary/[0.07] px-2.5 py-1 text-primary">
                                    New
                                  </span>
                                )}
                                {job.location?.isRemote && (
                                  <span className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1">
                                    Remote
                                  </span>
                                )}
                                <span>Posted {timeAgo(job.createdAt)}</span>
                              </div>

                              <div className="mt-3">
                                <h3 className="text-lg font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
                                  {job.title}
                                </h3>
                                <p className="mt-1 text-sm font-medium text-muted-foreground">{companyName}</p>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {remoteLabel}
                                </span>
                                {formatSalary(job) && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" />
                                    {formatSalary(job)}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                                  <Sparkles className="h-3.5 w-3.5" />
                                  Suggested for your profile
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-4 lg:min-w-[156px] lg:flex-col lg:items-stretch lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                            <div className="rounded-[18px] border border-border/60 bg-muted/20 px-4 py-3 text-left" aria-label={`Match score: ${job.matchScore} percent`}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Match score</div>
                              <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{job.matchScore}%</div>
                            </div>
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-all group-hover:gap-2 lg:justify-end">
                              View details
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[26px] border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                  <div className="text-lg font-semibold">No recommendations yet</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Finish your profile and preferences to unlock stronger job suggestions.
                  </p>
                  <Link href={`/${locale}/job-seeker/preferences`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                    Set preferences
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}

              {/* Already applied — shown below recommendations so the user understands why they may see fewer suggestions */}
              {appliedJobs.length > 0 && (
                <div className="mt-5 rounded-[22px] border border-border/50 bg-muted/20 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-selected))]" />
                      Already applied
                    </div>
                    <Link href={`/${locale}/job-seeker/applications`} className="text-xs font-semibold text-primary hover:underline">
                      View all →
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {appliedJobs.map((app) => {
                      const initials = (app.companyName ?? app.title)
                        .trim()
                        .split(" ")
                        .filter(Boolean)
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();
                      const statusLabel =
                        app.status === "selected"
                          ? "Selected"
                          : app.status === "interview"
                          ? "Interview"
                          : app.status === "rejected"
                          ? "Rejected"
                          : "Applied";
                      const statusClass =
                        app.status === "selected"
                          ? "text-[hsl(var(--status-selected))] bg-[hsl(var(--status-selected-bg))] border-[hsl(var(--status-selected)/0.2)]"
                          : app.status === "interview"
                          ? "text-[hsl(var(--status-interview))] bg-[hsl(var(--status-interview-bg))] border-[hsl(var(--status-interview)/0.2)]"
                          : app.status === "rejected"
                          ? "text-[hsl(var(--status-rejected))] bg-[hsl(var(--status-rejected-bg))] border-[hsl(var(--status-rejected)/0.2)]"
                          : "text-muted-foreground bg-muted/30 border-border/60";
                      return (
                        <Link
                          key={app._id}
                          href={`/${locale}/job-seeker/jobs/${app._id}`}
                          className="flex items-center gap-3 rounded-[16px] border border-border/50 bg-background px-3 py-2.5 transition-colors hover:border-primary/20 hover:bg-muted/30"
                        >
                          <Avatar className="h-8 w-8 rounded-xl border border-border/60 bg-muted/20 shrink-0">
                            <AvatarImage src={app.companyLogo ?? ""} alt={app.companyName ?? app.title} />
                            <AvatarFallback className="rounded-xl bg-primary/[0.08] text-xs font-semibold text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{app.title}</p>
                            {app.companyName && (
                              <p className="truncate text-xs text-muted-foreground">{app.companyName}</p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="card-base rounded-[28px] p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Priority actions</div>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">Improve your profile-to-job fit in the next few minutes</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Clear, ranked updates that help you improve visibility and match quality without turning the page into a checklist wall.
                  </p>
                </div>
                <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={openGuide}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open AI suggestions
                </Button>
              </div>

              {suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((item, index) => (
                    <Link
                      key={item.id}
                      href={`/${locale}/job-seeker/${item.href}`}
                      className="flex flex-col gap-4 rounded-[20px] border border-border/60 bg-background px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-primary/[0.08] text-sm font-semibold text-primary">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[15px] font-semibold text-foreground">{item.title}</div>
                            <Badge className="rounded-full border border-border/60 bg-muted/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:bg-muted/20">
                              High impact
                            </Badge>
                          </div>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{item.body}</p>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 text-sm font-semibold text-primary sm:shrink-0">
                        {item.cta}
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="dashboard-surface-success rounded-[24px] border px-5 py-5 text-foreground">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-[hsl(var(--status-selected))]" />
                    <div>
                      <div className="text-base font-semibold">Your home setup already looks strong.</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Browse fresh roles now, or keep refining your profile if you want even tighter recommendations.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24">
            <section className="card-base rounded-[28px] p-5">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 ring-4 ring-background shadow-sm">
                  <AvatarImage src={image} alt={name} />
                  <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{name}</h2>
                    {completion >= 80 && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-selected))]" />}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {profile?.summary?.slice(0, 118) || "Complete your profile to unlock stronger matches and recruiter attention."}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Profile completeness</span>
                  <span className="font-semibold text-foreground">{completion}%</span>
                </div>
                <Progress value={completion} aria-label={`Profile completeness: ${completion} percent`} />
              </div>

              {topSkills.length > 0 && (
                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top skills in your profile</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topSkills.map((skill) => (
                      <Badge key={skill} className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-background">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-2">
                <Link href={`/${locale}/job-seeker/profile`} className="flex items-center justify-between rounded-[20px] border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-primary" />
                    Update profile
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link href={`/${locale}/job-seeker/preferences`} className="flex items-center justify-between rounded-[20px] border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Update preferences
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </section>

            <section className="card-base rounded-[28px] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Quick access</div>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight">Stay close to your pipeline</h3>
                </div>
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-2">
                {quickLinks.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-[18px] border border-border/60 bg-background/80 px-3 py-3 text-sm transition-colors hover:bg-muted/30">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        {item.label}
                      </span>
                      <span className="font-semibold text-muted-foreground">{item.value}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="card-base rounded-[28px] p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-semibold">AI Daily Insights</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Short, high-signal nudges based on your profile quality and job-market activity.</p>
                </div>
                <button
                  onClick={() => {
                    try {
                      const key = `ai_insights_job_seeker_${new Date().toDateString()}`;
                      sessionStorage.removeItem(key);
                    } catch {
                      // Ignore storage access errors and refresh from network.
                    }
                    setAiInsights([]);
                    setAiInsightsKey((k) => k + 1);
                  }}
                  title="Refresh insights"
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-primary/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {aiInsightsLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-3 animate-pulse rounded bg-muted w-full" />
                  ))}
                </div>
              )}

              {!aiInsightsLoading && aiInsights.length === 0 && (
                <p className="text-xs leading-5 text-muted-foreground">Complete your profile to unlock AI insights.</p>
              )}

              {aiInsightsError && !aiInsightsLoading && (
                <p className="rounded-[18px] border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] px-3 py-2 text-xs leading-5 text-foreground">
                  {aiInsightsError}
                </p>
              )}

              {!aiInsightsLoading && aiInsights.length > 0 && (
                <ul className="space-y-3">
                  {aiInsights.slice(0, 3).map((insight, idx) => (
                    <li key={`${insight.type}-${insight.title}-${idx}`} className="rounded-[18px] border border-border/60 bg-background/80 px-4 py-3">
                      <div className="text-xs font-semibold text-foreground">{insight.title}</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {guideAnnouncement}
      </div>

      {guideOpen && (
        <div
          className="fixed inset-0 top-20 z-[90] flex justify-end bg-foreground/15 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeGuide();
            }
          }}
        >
          <div
            ref={guidePanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-guide-title"
            className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI suggestions</div>
                <h2 id="ai-guide-title" className="mt-1 text-2xl font-semibold tracking-tight">Let&apos;s improve your job matches</h2>
              </div>
              <button
                onClick={closeGuide}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close suggestions panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <div className="rounded-3xl bg-primary/[0.05] p-5">
                <p className="text-base font-medium leading-7">
                  Hi {name.split(" ")[0]}, recruiters respond better when your profile, preferences, and resume all point in the same direction.
                </p>
              </div>

              <div className="space-y-3">
                {suggestions.length > 0 ? suggestions.map((item) => (
                  <Link
                    key={item.id}
                    href={`/${locale}/job-seeker/${item.href}`}
                    onClick={closeGuide}
                    className="block rounded-3xl border border-border/60 px-5 py-4 transition-all hover:border-primary/30 hover:bg-muted/20"
                  >
                    <div className="text-base font-semibold">{item.title}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      {item.cta}
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Link>
                )) : (
                  <div className="dashboard-surface-success rounded-3xl border px-5 py-4 text-sm text-foreground">
                    Your home setup already looks good. You can browse jobs directly or keep refining your profile for even better recommendations.
                  </div>
                )}
              </div>

              {/* Real AI insights inside the slide-out panel */}
              {aiInsights.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-semibold">Personalized AI insights</span>
                  </div>
                  {aiInsights.map((insight, idx) => (
                    <div key={`${insight.type}-${insight.title}-${idx}`} className="rounded-3xl border border-border/60 px-5 py-4">
                      <div className="text-sm font-semibold">{insight.title}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.message}</p>
                      {insight.action && (
                        <p className="mt-2 text-xs font-medium text-primary">{insight.action}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-3xl border border-border/60 bg-muted/20 p-5">
                <div className="text-sm font-semibold">How this helps</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Suggestions open in a full side panel so guidance feels clear and actionable while you stay on the main page.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button asChild className="h-11 rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/jobs`} onClick={closeGuide}>
                    Browse jobs
                  </Link>
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={closeGuide}>
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
