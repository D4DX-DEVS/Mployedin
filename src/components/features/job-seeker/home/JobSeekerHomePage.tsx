"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  RefreshCw,
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

/** Typed bundle passed from the server component for zero-waterfall hydration. */
export type InitialHomeData = {
  profile: ProfileData;
  stats: DashboardStats;
  jobs: FeedJob[];
};

function formatSalary(job: FeedJob) {
  const salary = job.salary;
  if (!salary?.min || !salary?.max || !salary.currency) return null;
  return `${salary.min.toLocaleString()}-${salary.max.toLocaleString()} ${salary.currency}`;
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
  const suggestions = [];

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
  // If SSR data was provided this is false from the start — no loading flash
  const [loading, setLoading] = useState(!initialData);
  const [guideOpen, setGuideOpen] = useState(false);
  const [aiInsights, setAiInsights] = useState<Array<{ type: string; title: string; message: string; action?: string }>>([]);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsKey, setAiInsightsKey] = useState(0);

  useEffect(() => {
    // SSR primed — skip the initial data fetch entirely
    if (initialData) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      try {
        const [profileRes, statsRes, jobsRes] = await Promise.all([
          fetch("/api/job-seeker/profile"),
          fetch("/api/dashboard/stats"),
          fetch("/api/jobs/recommended?limit=6&sort=match"),
        ]);

        const [profileData, statsData, jobsData] = await Promise.all([
          profileRes.ok ? profileRes.json() : null,
          statsRes.ok ? statsRes.json() : null,
          jobsRes.ok ? jobsRes.json() : null,
        ]);

        if (!active) return;
        setProfile(profileData);
        setStats(statsData);
        setJobs(jobsData?.jobs ?? []);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    try {
      const seen = window.sessionStorage.getItem("job-seeker-home-guide-seen");
      if (!seen) {
        setGuideOpen(true);
        window.sessionStorage.setItem("job-seeker-home-guide-seen", "1");
      }
    } catch {
      setGuideOpen(true);
    }

    return () => {
      active = false;
    };
  }, [initialData]);

  // Fetch real AI insights (cached per day in sessionStorage)
  useEffect(() => {
    const cacheKey = `ai_insights_job_seeker_${new Date().toDateString()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached && aiInsightsKey === 0) {
      try { setAiInsights(JSON.parse(cached)); return; } catch { /* ignore */ }
    }

    let active = true;
    const load = async () => {
      setAiInsightsLoading(true);
      try {
        const res = await fetch("/api/ai/daily-insights");
        if (res.ok && active) {
          const data = await res.json();
          const items = data.insights ?? [];
          setAiInsights(items);
          sessionStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } finally {
        if (active) setAiInsightsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [aiInsightsKey]);

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
      ? `${profile.preferredSalary.min.toLocaleString()}-${profile.preferredSalary.max.toLocaleString()} ${profile.preferredSalary.currency}`
      : "Set your salary range";

  const suggestions = useMemo(() => buildSuggestions(profile), [profile]);

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-[28px] border border-border/60 bg-gradient-to-br from-white via-white to-primary/[0.03] px-6 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Job seeker home
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Find better jobs faster.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                Keep your profile strong, review smart suggestions, and jump straight into jobs when you are ready.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Applications</div>
                <div className="mt-1 text-xl font-semibold">{stats?.applicationsSent?.count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saved</div>
                <div className="mt-1 text-xl font-semibold">{stats?.savedJobs?.count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Interviews</div>
                <div className="mt-1 text-xl font-semibold">{stats?.upcomingInterviews?.count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recruiter views</div>
                <div className="mt-1 text-xl font-semibold">{stats?.recruiterViews?.total ?? 0}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="space-y-5">
            <section className="card-base rounded-[24px] p-5">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 ring-4 ring-background shadow-sm">
                  <AvatarImage src={image} alt={name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{name}</h2>
                    {completion >= 80 && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {profile?.summary?.slice(0, 90) || "Complete your profile to unlock stronger matches."}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Profile completeness</span>
                  <span className="font-semibold text-foreground">{completion}%</span>
                </div>
                <Progress value={completion} />
              </div>

              <div className="mt-5 space-y-2">
                <Link href={`/${locale}/job-seeker/profile`} className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-primary" />
                    Complete profile
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link href={`/${locale}/job-seeker/preferences`} className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Update preferences
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link href={`/${locale}/job-seeker/jobs`} className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    Browse jobs
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </section>

            <section className="card-base rounded-[24px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Your setup</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-2xl bg-muted/35 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Role</div>
                  <div className="mt-1 font-medium">{preferredRole}</div>
                </div>
                <div className="rounded-2xl bg-muted/35 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</div>
                  <div className="mt-1 font-medium">{preferredLocation}</div>
                </div>
                <div className="rounded-2xl bg-muted/35 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Salary</div>
                  <div className="mt-1 font-medium">{preferredSalary}</div>
                </div>
              </div>
            </section>
          </aside>

          <div className="space-y-5">
            <section className="card-base rounded-[24px] p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <Badge className="mb-3 rounded-full bg-primary/[0.08] px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/[0.08]">
                    Guided suggestions
                  </Badge>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    AI can help improve your matches without feeling like a chatbot.
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We are surfacing guidance as a real page experience. Use this section to fix profile gaps, widen your reach, and move faster toward relevant jobs.
                  </p>
                </div>

                <Button onClick={() => setGuideOpen(true)} className="h-11 rounded-full px-5">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open AI suggestions
                </Button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {suggestions.length > 0 ? suggestions.map((item) => (
                  <Link key={item.id} href={`/${locale}/job-seeker/${item.href}`} className="rounded-2xl border border-border/60 bg-background px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
                    <div className="text-sm font-semibold">{item.title}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      {item.cta}
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Link>
                )) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 md:col-span-3">
                    Your setup looks strong. Start browsing jobs or keep refining your profile for even tighter matches.
                  </div>
                )}
              </div>
            </section>

            <section className="card-base rounded-[24px] p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight">Recommended jobs for you</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Quick previews based on your profile. Open the jobs page for full browsing and filtering.
                  </p>
                </div>
                <Link href={`/${locale}/job-seeker/jobs`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mb-4 flex items-center gap-5 border-b border-border/60 pb-3 text-sm">
                <span className="border-b-2 border-foreground pb-3 -mb-3 font-semibold">Profile</span>
                <span className="font-medium text-muted-foreground">You might like</span>
                <span className="font-medium text-muted-foreground">Preferences</span>
              </div>

              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="h-48 animate-pulse rounded-3xl bg-muted/60" />
                  ))}
                </div>
              ) : jobs.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {jobs.map((job) => (
                    <Link
                      key={job._id}
                      href={`/${locale}/job-seeker/jobs/${job._id}`}
                      className="rounded-[24px] border border-border/60 bg-background p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-lg font-semibold leading-6">{job.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{job.employerId?.companyName ?? "Company"}</div>
                        </div>
                        <Badge className="shrink-0 rounded-full bg-primary/[0.08] px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/[0.08]">
                          {job.matchScore}% match
                        </Badge>
                      </div>

                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span className="truncate">
                            {job.location?.isRemote ? "Remote" : [job.location?.city, job.location?.country].filter(Boolean).join(", ")}
                          </span>
                        </div>
                        {formatSalary(job) && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span>{formatSalary(job)}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">{timeAgo(job.createdAt)}</span>
                        <span className="text-sm font-semibold text-primary">Open job</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                  <div className="text-lg font-semibold">No recommendations yet</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Finish your profile and preferences to unlock better job suggestions.
                  </p>
                  <Link href={`/${locale}/job-seeker/preferences`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                    Set preferences
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="card-base rounded-[24px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">What needs attention</h3>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-3">
                  <div className="text-sm font-medium">Job recommendations improve when your profile is complete.</div>
                  <p className="mt-1 text-sm text-muted-foreground">Your current completion is {completion}%.</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-3">
                  <div className="text-sm font-medium">Keep your preferences updated.</div>
                  <p className="mt-1 text-sm text-muted-foreground">Recruiters and matching both depend on role, location, and salary fit.</p>
                </div>
              </div>
            </section>

            <section className="card-base rounded-[24px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Quick links</h3>
              </div>
              <div className="space-y-2">
                <Link href={`/${locale}/job-seeker/applications`} className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Applications
                  </span>
                  <span className="font-semibold text-muted-foreground">{stats?.applicationsSent?.count ?? 0}</span>
                </Link>
                <Link href={`/${locale}/job-seeker/interviews`} className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Interviews
                  </span>
                  <span className="font-semibold text-muted-foreground">{stats?.upcomingInterviews?.count ?? 0}</span>
                </Link>
                <Link href={`/${locale}/job-seeker/offers`} className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    Offers
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </section>

            <section className="card-base rounded-[24px] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-semibold">AI Daily Insights</span>
                </div>
                <button
                  onClick={() => {
                    const key = `ai_insights_job_seeker_${new Date().toDateString()}`;
                    sessionStorage.removeItem(key);
                    setAiInsights([]);
                    setAiInsightsKey((k) => k + 1);
                  }}
                  title="Refresh insights"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10"
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
                <p className="text-xs text-muted-foreground">Complete your profile to unlock AI insights.</p>
              )}

              {!aiInsightsLoading && aiInsights.length > 0 && (
                <ul className="space-y-2.5">
                  {aiInsights.map((insight, idx) => (
                    <li key={idx} className="rounded-2xl bg-muted/25 px-3 py-2.5">
                      <div className="text-xs font-semibold">{insight.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{insight.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>

      {guideOpen && (
        <div className="fixed inset-0 top-16 z-[90] flex justify-end bg-slate-950/28 backdrop-blur-[2px]">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI suggestions</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Let&apos;s improve your job matches</h2>
              </div>
              <button
                onClick={() => setGuideOpen(false)}
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
                    onClick={() => setGuideOpen(false)}
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
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
                    Your home setup already looks good. You can browse jobs directly or keep refining your profile for even better recommendations.
                  </div>
                )}
              </div>

              {/* Real AI insights inside the slide-out panel */}
              {aiInsights.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-semibold">Personalised AI insights</span>
                  </div>
                  {aiInsights.map((insight, idx) => (
                    <div key={idx} className="rounded-3xl border border-border/60 px-5 py-4">
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
                  <Link href={`/${locale}/job-seeker/jobs`} onClick={() => setGuideOpen(false)}>
                    Browse jobs
                  </Link>
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={() => setGuideOpen(false)}>
                  Maybe later
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
