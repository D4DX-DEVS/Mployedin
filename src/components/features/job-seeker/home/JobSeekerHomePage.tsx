"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCircle,
  Wand2,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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

type SuggestionItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  /** AI-fillable section id — when set, the suggestion can be auto-filled by AI */
  section?: "summary" | "skills" | "experience" | "education" | "languages";
  placeholder?: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timeAgo(iso: string, locale: string, translate: any): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return translate("time.justNow");
  if (hours < 24) return translate("time.hoursAgo", { value: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return translate("time.daysAgo", { value: days });
  const weeks = Math.floor(days / 7);
  return translate("time.weeksAgo", { value: weeks });
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
  userImage?: string;
}) {
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
  const [aiFillActive, setAiFillActive] = useState<string | null>(null); // suggestion id currently being auto-filled

  const t = useTranslations("jobSeekerHome");
  const isAr = locale === "ar";

  // Compute completeness live from actual profile fields (same formula as profile page)
  const completion = profile ? Math.min(100, [
    profile.userId                                                           ? 10 : 0,
    profile.nationality                                                      ? 10 : 0,
    profile.currentLocation                                                  ? 5  : 0,
    profile.summary                                                          ? 10 : 0,
    (profile.skills?.length ?? 0) > 0                                       ? 20 : 0,
    (profile.experience?.length ?? 0) > 0                                   ? 20 : 0,
    (profile.education?.length ?? 0) > 0                                    ? 15 : 0,
    (profile.languages?.length ?? 0) > 0                                    ? 5  : 0,
    (profile.linkedin || profile.socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin")) ? 5 : 0,
  ].reduce((a, b) => a + b, 0)) : 0;
  const [aiFillInput, setAiFillInput] = useState("");
  const [aiFillLoading, setAiFillLoading] = useState(false);
  const [aiFillResult, setAiFillResult] = useState<{ section: string; message: string } | null>(null);
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
    setAiFillActive(null);
    setAiFillInput("");
    setAiFillResult(null);
  };

  const handleAiFill = async (item: SuggestionItem) => {
    if (!item.section || !aiFillInput.trim()) return;
    setAiFillLoading(true);
    setAiFillResult(null);
    try {
      const res = await fetch("/api/ai/profile-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: item.section, input: aiFillInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiFillResult({ section: item.section, message: data.error || t("messages.genericError") });
        return;
      }
      setAiFillResult({ section: item.section, message: data.message });
      // Refresh profile data to update completeness + suggestions
      const profileRes = await fetch("/api/job-seeker/profile");
      if (profileRes.ok) {
        const freshProfile = await profileRes.json();
        setProfile(freshProfile);
      }
      setAiFillInput("");
      setAiFillActive(null);
    } catch {
      setAiFillResult({ section: item.section ?? "", message: t("messages.networkError") });
    } finally {
      setAiFillLoading(false);
    }
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
        setHomeDataError(t("messages.homeDataError"));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    try {
      const seen = window.sessionStorage.getItem("job-seeker-home-guide-seen");
      if (!seen) {
        setGuideAnnouncement(t("announcements.guideOpened"));
        setGuideOpen(true);
        window.sessionStorage.setItem("job-seeker-home-guide-seen", "1");
      }
    } catch {
      setGuideAnnouncement(t("announcements.guideOpened"));
      setGuideOpen(true);
    }

    return () => {
      active = false;
    };
  }, [initialData]);

  // Fetch real AI insights (cached per day + completeness level in sessionStorage)
  useEffect(() => {
    const cacheKey = `ai_insights_job_seeker_${new Date().toDateString()}_c${completion}`;
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
        setAiInsightsError(t("messages.aiInsightsUnavailable"));
      } finally {
        if (active) setAiInsightsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [aiInsightsKey, completion]);

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

  const name = userName ?? t("defaults.jobSeekerName");
  const image = userImage ?? "";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Pick the most relevant role — the one matching the most recommended job titles
  const { primaryRole, otherRolesLabel } = useMemo(() => {
    const roles = profile?.preferredRoles ?? [];
    if (roles.length === 0) return { primaryRole: t("hero.addTargetRole"), otherRolesLabel: "" };
    if (roles.length === 1) return { primaryRole: roles[0], otherRolesLabel: "" };

    // Count how many recommended jobs each role appears in
    const counts = roles.map((role) => {
      const needle = role.toLowerCase();
      return jobs.filter((j) => j.title.toLowerCase().includes(needle)).length;
    });
    const maxCount = Math.max(...counts);
    const bestIdx = maxCount > 0 ? counts.indexOf(maxCount) : 0;
    const primary = roles[bestIdx];
    const others = roles.filter((_, i) => i !== bestIdx);

    let label = "";
    if (others.length === 1) {
      label = t("hero.alsoExploringSingle", { roles: others[0] });
    } else if (others.length === 2) {
      label = t("hero.alsoExploringList", { roles: `${others[0]}, ${others[1]}` });
    } else if (others.length > 2) {
      label = t("hero.alsoExploringMore", { roles: `${others[0]}, ${others[1]}`, count: others.length - 2 });
    }
    return { primaryRole: primary, otherRolesLabel: label };
  }, [profile?.preferredRoles, jobs, t]);

  const preferredLocation = profile?.preferredCountries?.slice(0, 2).join(", ") || t("hero.addPreferredLocations");
  const preferredSalary =
    profile?.preferredSalary?.min && profile?.preferredSalary?.max && profile?.preferredSalary?.currency
      ? `${profile.preferredSalary.min.toLocaleString("en-US")}-${profile.preferredSalary.max.toLocaleString("en-US")} ${profile.preferredSalary.currency}`
      : t("hero.setSalaryRange");

  const suggestions = useMemo(() => {
    const items: SuggestionItem[] = [];

    if (!profile?.cvFileUrl && !profile?.cv?.originalUrl) {
      items.push({
        id: "resume",
        title: t("suggestions.resume.title"),
        body: t("suggestions.resume.body"),
        href: "cv",
        cta: t("suggestions.resume.cta"),
      });
    }

    if (!profile?.summary) {
      items.push({
        id: "summary",
        title: t("suggestions.summary.title"),
        body: t("suggestions.summary.body"),
        href: "profile#summary",
        cta: t("suggestions.summary.cta"),
        section: "summary",
        placeholder: t("suggestions.summary.placeholder"),
      });
    }

    if ((profile?.preferredRoles?.length ?? 0) === 0 || (profile?.preferredCountries?.length ?? 0) === 0) {
      items.push({
        id: "preferences",
        title: t("suggestions.preferences.title"),
        body: t("suggestions.preferences.body"),
        href: "preferences",
        cta: t("suggestions.preferences.cta"),
      });
    }

    if ((profile?.skills?.length ?? 0) < 5) {
      items.push({
        id: "skills",
        title: t("suggestions.skills.title"),
        body: t("suggestions.skills.body"),
        href: "profile#skills",
        cta: t("suggestions.skills.cta"),
        section: "skills",
        placeholder: t("suggestions.skills.placeholder"),
      });
    }

    if ((profile?.experience?.length ?? 0) === 0) {
      items.push({
        id: "experience",
        title: t("suggestions.experience.title"),
        body: t("suggestions.experience.body"),
        href: "profile#experience",
        cta: t("suggestions.experience.cta"),
        section: "experience",
        placeholder: t("suggestions.experience.placeholder"),
      });
    }

    if ((profile?.education?.length ?? 0) === 0) {
      items.push({
        id: "education",
        title: t("suggestions.education.title"),
        body: t("suggestions.education.body"),
        href: "profile#education",
        cta: t("suggestions.education.cta"),
        section: "education",
        placeholder: t("suggestions.education.placeholder"),
      });
    }

    if ((profile?.languages?.length ?? 0) === 0) {
      items.push({
        id: "languages",
        title: t("suggestions.languages.title"),
        body: t("suggestions.languages.body"),
        href: "profile#languages",
        cta: t("suggestions.languages.cta"),
        section: "languages",
        placeholder: t("suggestions.languages.placeholder"),
      });
    }

    return items.slice(0, 5);
  }, [profile, t]);
  const applicationCount = stats?.applicationsSent?.count ?? 0;
  const savedJobsCount = stats?.savedJobs?.count ?? 0;
  const interviewCount = stats?.upcomingInterviews?.count ?? 0;
  const profileViewCount = stats?.recruiterViews?.total ?? 0;
  const quickLinks = [
    {
      label: t("quickAccess.applications"),
      href: `/${locale}/job-seeker/applications`,
      icon: FileText,
      value: String(stats?.applicationsSent?.count ?? 0),
    },
    {
      label: t("quickAccess.interviews"),
      href: `/${locale}/job-seeker/interviews`,
      icon: CalendarDays,
      value: String(stats?.upcomingInterviews?.count ?? 0),
    },
    {
      label: t("quickAccess.preferences"),
      href: `/${locale}/job-seeker/preferences`,
      icon: Target,
      value: t("quickAccess.edit"),
    },
  ];
  const topSkills = (profile?.skills ?? [])
    .map((skill) => (typeof skill === "string" ? skill.trim() : skill.name?.trim()))
    .filter((skill): skill is string => Boolean(skill))
    .slice(0, 6);
  const activeMatchesCountLabel = t("summary.activeMatches", { count: jobs.length });
  const nextStepsLabel = t("summary.nextStepsQueued", { count: suggestions.length });

  return (
    <>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-border/70 bg-background px-3 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:px-6 sm:py-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-[2rem]">{primaryRole}</h1>
                {otherRolesLabel && (
                  <p className="mt-0.5 text-sm text-muted-foreground/80">{otherRolesLabel}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{preferredLocation}</span>
                  <span aria-hidden="true">•</span>
                  <span>{preferredSalary}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild className="h-11 rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/jobs`}>
                    <Search className={`${isAr ? "ml-2" : "mr-2"} h-4 w-4`} />
                    {t("hero.browseMatchingJobs")}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/preferences`}>
                    <SlidersHorizontal className={`${isAr ? "ml-2" : "mr-2"} h-4 w-4`} />
                    {t("hero.refine")}
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={openGuide}
                  className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Sparkles className="h-4 w-4" />
                  {t("hero.aiSuggestions")}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{activeMatchesCountLabel}</span>
              <span>
                <span className="font-semibold text-foreground">{applicationCount}</span> {t("summary.applications")}
              </span>
              <span>
                <span className="font-semibold text-foreground">{savedJobsCount}</span> {t("summary.savedJobs")}
              </span>
              <span>
                <span className="font-semibold text-foreground">{interviewCount}</span> {t("summary.interviews")}
              </span>
              <span>
                <span className="font-semibold text-foreground">{profileViewCount}</span> {t("summary.profileViews")}
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

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.72fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-5">
            <section className="card-base overflow-hidden rounded-[28px] p-4 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("recommendedJobs.eyebrow")}</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-2xl">{t("recommendedJobs.title")}</h2>
                </div>
                <Link href={`/${locale}/job-seeker/jobs`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  {t("recommendedJobs.viewAll")}
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
                    const companyName = job.employerId?.companyName ?? t("recommendedJobs.companyFallback");
                    const companyInitials = companyName
                      .trim()
                      .split(" ")
                      .filter(Boolean)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const remoteLabel = job.location?.isRemote
                      ? t("recommendedJobs.remote")
                      : [job.location?.city, job.location?.country].filter(Boolean).join(", ") || t("recommendedJobs.locationFlexible");
                    const fresh = Date.now() - new Date(job.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;

                    return (
                      <Link
                        key={job._id}
                        href={`/${locale}/job-seeker/jobs/${job._id}`}
                        className="group block overflow-hidden rounded-[22px] border border-border/60 bg-background px-3 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_32px_rgba(15,23,42,0.06)] sm:px-5"
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
                                    {t("recommendedJobs.new")}
                                  </span>
                                )}
                                {job.location?.isRemote && (
                                  <span className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1">
                                    {t("recommendedJobs.remote")}
                                  </span>
                                )}
                                <span>{t("recommendedJobs.posted", { time: timeAgo(job.createdAt, locale, t) })}</span>
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
                                  {t("recommendedJobs.suggestedForProfile")}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-4 lg:min-w-[156px] lg:flex-col lg:items-stretch lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                            <div className="rounded-[18px] border border-border/60 bg-muted/20 px-4 py-3 text-left" aria-label={t("recommendedJobs.matchScoreAria", { score: job.matchScore })}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("recommendedJobs.matchScore")}</div>
                              <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{job.matchScore}%</div>
                            </div>
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-all group-hover:gap-2 lg:justify-end">
                              {t("recommendedJobs.viewDetails")}
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
                  <div className="text-lg font-semibold">{t("recommendedJobs.emptyTitle")}</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("recommendedJobs.emptyBody")}
                  </p>
                  <Link href={`/${locale}/job-seeker/preferences`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                    {t("recommendedJobs.emptyCta")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}

              {/* Already applied — shown below recommendations so the user understands why they may see fewer suggestions */}
              {appliedJobs.length > 0 && (
                <div className="mt-5 rounded-[22px] border border-border/50 bg-muted/20 px-3 py-4 sm:px-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-selected))]" />
                      {t("appliedJobs.eyebrow")}
                    </div>
                    <Link href={`/${locale}/job-seeker/applications`} className="text-xs font-semibold text-primary hover:underline">
                      {t("appliedJobs.viewAll")}
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
                          ? t("statuses.selected")
                          : app.status === "interview"
                          ? t("statuses.interview")
                          : app.status === "rejected"
                          ? t("statuses.rejected")
                          : t("statuses.applied");
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
                          className="flex items-center gap-2 rounded-[16px] border border-border/50 bg-background px-2 py-2.5 transition-colors hover:border-primary/20 hover:bg-muted/30 sm:gap-3 sm:px-3"
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
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="card-base overflow-hidden rounded-[28px] p-4 sm:p-6">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("priorityActions.eyebrow")}</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-2xl">{t("priorityActions.title")}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t("priorityActions.description")}
                  </p>
                </div>
                <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={openGuide}>
                  <Sparkles className={`${isAr ? "ml-2" : "mr-2"} h-4 w-4`} />
                  {t("priorityActions.openAiSuggestions")}
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
                              {t("priorityActions.highImpact")}
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
                      <div className="text-base font-semibold">{t("priorityActions.completeTitle")}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t("priorityActions.completeBody")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-5 xl:sticky xl:top-24">
            <section className="card-base overflow-hidden rounded-[28px] p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <Avatar className="h-12 w-12 shrink-0 ring-4 ring-background shadow-sm sm:h-16 sm:w-16">
                  <AvatarImage src={image} alt={name} />
                  <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground sm:text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold sm:text-lg">{name}</h2>
                    {completion >= 80 && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-selected))]" />}
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {profile?.summary?.slice(0, 118) || t("profileCard.summaryFallback")}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("profileCard.profileCompleteness")}</span>
                  <span className="font-semibold text-foreground">{completion}%</span>
                </div>
                <Progress value={completion} aria-label={t("profileCard.profileCompletenessAria", { completion })} />
              </div>

              {topSkills.length > 0 && (
                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("profileCard.topSkills")}</div>
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
                    {t("profileCard.updateProfile")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link href={`/${locale}/job-seeker/preferences`} className="flex items-center justify-between rounded-[20px] border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    {t("profileCard.updatePreferences")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </section>

            <section className="card-base overflow-hidden rounded-[28px] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("quickAccess.eyebrow")}</div>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight">{t("quickAccess.title")}</h3>
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

            <section className="card-base overflow-hidden rounded-[28px] p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-semibold">{t("insights.title")}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("insights.description")}</p>
                </div>
                <button
                  onClick={() => {
                    try {
                      const key = `ai_insights_job_seeker_${new Date().toDateString()}_c${completion}`;
                      sessionStorage.removeItem(key);
                    } catch {
                      // Ignore storage access errors and refresh from network.
                    }
                    setAiInsights([]);
                    setAiInsightsKey((k) => k + 1);
                  }}
                  title="Refresh insights"
                  aria-label={t("insights.refresh")}
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
                <p className="text-xs leading-5 text-muted-foreground">{t("insights.empty")}</p>
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
          className={cn(
            "fixed inset-0 top-20 z-[90] flex bg-foreground/15 backdrop-blur-[2px]",
            isAr ? "justify-start" : "justify-end"
          )}
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
            className={cn(
              "h-full w-full max-w-xl overflow-y-auto bg-background shadow-2xl",
              isAr ? "border-r border-border" : "border-l border-border"
            )}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("drawer.eyebrow")}</div>
                <h2 id="ai-guide-title" className="mt-1 text-2xl font-semibold tracking-tight">{t("drawer.title")}</h2>
              </div>
              <button
                onClick={closeGuide}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("drawer.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <div className="rounded-3xl bg-primary/[0.05] p-5">
                <p className="text-base font-medium leading-7">
                  {t("drawer.intro", { name: name.split(" ")[0] })}
                </p>
              </div>

              {aiFillResult && (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${aiFillResult.message.includes("error") || aiFillResult.message.includes("wrong") ? "border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))]" : "dashboard-surface-success border-[hsl(var(--status-selected)/0.18)]"}`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-selected))]" />
                    {aiFillResult.message}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {suggestions.length > 0 ? suggestions.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-border/60 px-5 py-4 transition-all hover:border-primary/30">
                    <div className="text-base font-semibold">{item.title}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>

                    {/* AI auto-fill section */}
                    {item.section && aiFillActive === item.id && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={aiFillInput}
                          onChange={(e) => setAiFillInput(e.target.value)}
                          placeholder={item.placeholder}
                          rows={3}
                          maxLength={2000}
                          disabled={aiFillLoading}
                          className="w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={aiFillLoading || !aiFillInput.trim()}
                            onClick={() => handleAiFill(item)}
                            className="h-9 rounded-full px-4"
                          >
                            {aiFillLoading ? (
                              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> {t("drawer.aiWorking")}</>
                            ) : (
                              <><Wand2 className="mr-2 h-3.5 w-3.5" /> {t("drawer.fillWithAi")}</>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={aiFillLoading}
                            onClick={() => { setAiFillActive(null); setAiFillInput(""); }}
                            className="h-9 rounded-full px-3 text-muted-foreground"
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {item.section && aiFillActive !== item.id && (
                        <button
                          type="button"
                          onClick={() => { setAiFillActive(item.id); setAiFillInput(""); setAiFillResult(null); }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/[0.14]"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          {t("drawer.letAiFill")}
                        </button>
                      )}
                      <Link
                        href={`/${locale}/job-seeker/${item.href}`}
                        onClick={closeGuide}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.cta}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                )) : (
                  <div className="dashboard-surface-success rounded-3xl border px-5 py-4 text-sm text-foreground">
                    {t("drawer.completeState")}
                  </div>
                )}
              </div>

              {/* Real AI insights inside the slide-out panel */}
              {aiInsights.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-semibold">{t("drawer.personalizedInsights")}</span>
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
                <div className="text-sm font-semibold">{t("drawer.howThisHelpsTitle")}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("drawer.howThisHelpsBody")}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button asChild className="h-11 rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/jobs`} onClick={closeGuide}>
                    {t("drawer.browseJobs")}
                  </Link>
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={closeGuide}>
                  {t("drawer.notNow")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
