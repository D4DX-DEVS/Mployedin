"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCircle,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatLocalizedLocation, getLocalizedCountryName } from "@/lib/i18n/locations";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/security/csrf-client";
import { DashboardNextAction, DashboardSignalStrip } from "@/components/shared/DashboardOverview";

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
  pendingOffers?: { count: number };
  unreadMessages?: { count: number };
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

type Priority = "urgent" | "medium" | "suggestion";

/**
 * Severity is carried in colour as well as in the label, so the ranking is
 * legible at a glance. Every row previously wore one hardcoded "HIGH IMPACT"
 * badge, which told the reader nothing.
 */
function severityBadgeClass(severity: Priority): string {
  switch (severity) {
    case "urgent":
      return "bg-[hsl(var(--status-rejected-bg))] text-[hsl(var(--status-rejected))]";
    case "medium":
      return "bg-[hsl(var(--status-shortlisted-bg))] text-[hsl(var(--status-shortlisted))]";
    default:
      return "bg-muted text-muted-foreground";
  }
}

type NextActionItem = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge: string;
  severity: Priority;
};

/** Typed bundle passed from the server component for zero-waterfall hydration. */
export type InitialHomeData = {
  profile: ProfileData;
  stats: DashboardStats;
  jobs: FeedJob[];
  appliedJobs?: AppliedJobSnippet[];
};

function formatSalary(job: FeedJob, numberLocale: string) {
  const salary = job.salary;
  if (!salary?.min || !salary?.max || !salary.currency) return null;
  return `${salary.min.toLocaleString(numberLocale)}-${salary.max.toLocaleString(numberLocale)} ${salary.currency}`;
}

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
  const numberLocale = isAr ? "ar-SA" : "en-US";
  const formatNumber = (value: number) => value.toLocaleString(numberLocale);

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
      const res = await csrfFetch("/api/ai/profile-fill", {
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

  // Handle onboarding drawer auto-open — independent of data loading
  useEffect(() => {
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
  }, [t]);

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
        // Two applications can point at the same job, which produced duplicate
        // React keys in the "already applied" list. Keep the first per job.
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

  // Fetch real AI insights (cached per day + completeness level in sessionStorage)
  useEffect(() => {
    const cacheKey = `ai_insights_job_seeker_${locale}_${new Date().toDateString()}_c${completion}`;
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
        const res = await fetch(`/api/ai/daily-insights?locale=${locale}`);
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
  }, [aiInsightsKey, completion, locale]);

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

  const preferredLocation = profile?.preferredCountries
    ?.slice(0, 2)
    .map((country) => getLocalizedCountryName(country, locale))
    .join(", ") || t("hero.addPreferredLocations");
  const preferredSalary =
    profile?.preferredSalary?.min && profile?.preferredSalary?.max && profile?.preferredSalary?.currency
      ? `${profile.preferredSalary.min.toLocaleString(numberLocale)}-${profile.preferredSalary.max.toLocaleString(numberLocale)} ${profile.preferredSalary.currency}`
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
  const interviewCount = stats?.upcomingInterviews?.count ?? 0;
  const pendingOfferCount = stats?.pendingOffers?.count ?? 0;
  const unreadMessageCount = stats?.unreadMessages?.count ?? 0;

  const quickLinks = [
    {
      label: t("quickAccess.applications"),
      href: `/${locale}/job-seeker/applications`,
      icon: FileText,
      value: formatNumber(stats?.applicationsSent?.count ?? 0),
    },
    {
      label: t("quickAccess.interviews"),
      href: `/${locale}/job-seeker/interviews`,
      icon: CalendarDays,
      value: formatNumber(stats?.upcomingInterviews?.count ?? 0),
    },
    {
      label: t("quickAccess.savedJobs"),
      href: `/${locale}/job-seeker/saved-jobs`,
      icon: Bookmark,
      value: formatNumber(stats?.savedJobs?.count ?? 0),
    },
    {
      label: t("quickAccess.profileViews"),
      href: `/${locale}/job-seeker/profile-views`,
      icon: Eye,
      value: formatNumber(stats?.recruiterViews?.total ?? 0),
    },
  ];
  const topSkills = (profile?.skills ?? [])
    .map((skill) => (typeof skill === "string" ? skill.trim() : skill.name?.trim()))
    .filter((skill): skill is string => Boolean(skill))
    .slice(0, 6);
  const activeMatchesCountLabel = t("summary.activeMatches", {
    count: jobs.length,
    countLabel: formatNumber(jobs.length),
  });
  const nextStepsLabel = t("summary.nextStepsQueued", {
    count: suggestions.length,
    countLabel: formatNumber(suggestions.length),
  });
  const firstSuggestion = suggestions[0];

  /**
   * Everything currently waiting on the seeker, most urgent first.
   *
   * This used to be a single if/else that returned one action, so a pending
   * offer hid an unconfirmed interview behind it and the seeker never learned
   * the second thing existed. Building the full list and rendering the tail as
   * secondary actions mirrors the employer's PriorityActions.
   */
  const rankedActions: NextActionItem[] = [];
  if (pendingOfferCount > 0) {
    rankedActions.push({
      title: t("taskFirst.respondToOfferTitle", { count: formatNumber(pendingOfferCount) }),
      description: t("taskFirst.respondToOfferDescription"),
      href: `/${locale}/job-seeker/offers`,
      icon: CheckCircle2,
      badge: t("taskFirst.urgent"),
      severity: "urgent",
    });
  }
  if (interviewCount > 0) {
    rankedActions.push({
      title: t("taskFirst.interviewTitle", { count: formatNumber(interviewCount) }),
      description: t("taskFirst.interviewDescription"),
      href: `/${locale}/job-seeker/interviews`,
      icon: CalendarDays,
      badge: t("taskFirst.urgent"),
      severity: "urgent",
    });
  }
  if (unreadMessageCount > 0) {
    rankedActions.push({
      title: t("taskFirst.checkMessagesTitle", { count: formatNumber(unreadMessageCount) }),
      description: t("taskFirst.checkMessagesDescription"),
      href: `/${locale}/job-seeker/messages`,
      icon: MessageSquare,
      badge: t("taskFirst.medium"),
      severity: "medium",
    });
  }
  if (firstSuggestion) {
    rankedActions.push({
      title: firstSuggestion.title,
      description: firstSuggestion.body,
      href: `/${locale}/job-seeker/${firstSuggestion.href}`,
      icon: Sparkles,
      badge: t("taskFirst.suggestion"),
      severity: "suggestion",
    });
  }
  if (applicationCount > 0) {
    rankedActions.push({
      title: t("taskFirst.trackApplicationsTitle"),
      description: t("taskFirst.trackApplicationsDescription"),
      href: `/${locale}/job-seeker/applications`,
      icon: FileText,
      badge: t("taskFirst.suggestion"),
      severity: "suggestion",
    });
  }
  // A seeker with nothing pending and nothing applied still needs a first move.
  if (rankedActions.length === 0) {
    rankedActions.push({
      title: t("hero.browseMatchingJobs"),
      description: t("taskFirst.browseDescription"),
      href: `/${locale}/job-seeker/jobs`,
      icon: Search,
      badge: t("taskFirst.suggestion"),
      severity: "suggestion",
    });
  }
  const nextAction = rankedActions[0];
  const secondaryActions = rankedActions.slice(1, 3);

  const signals = quickLinks.map((item) => ({
    label: item.label,
    value: item.value,
    href: item.href,
    icon: item.icon,
  }));

  return (
    <>
      <div className="page-container dashboard-overview-page">
        <section className="overflow-hidden rounded-xl sm:rounded-3xl border border-border/70 bg-background shadow-[0_8px_24px_rgba(15,23,42,0.04)] panel-body">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h1 className="heading-page text-foreground">{primaryRole}</h1>
                {otherRolesLabel && (
                  <p className="mt-0.5 text-sm text-muted-foreground/80">{otherRolesLabel}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{preferredLocation}</span>
                  <span aria-hidden="true">•</span>
                  <span>{preferredSalary}</span>
                </div>
              </div>

              {/* Single row on phones: the primary CTA flexes, the two secondary
                  actions shrink to icon-sized pills so nothing wraps to line 3. */}
              <div className="flex items-center gap-2 sm:flex-wrap">
                <Button asChild className="min-h-11 min-w-0 flex-1 rounded-full px-4 sm:flex-none sm:px-5">
                  <Link href={`/${locale}/job-seeker/jobs`}>
                    <Search className="me-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{t("hero.browseMatchingJobs")}</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11 shrink-0 rounded-full px-3 sm:px-5">
                  <Link href={`/${locale}/job-seeker/preferences`} aria-label={t("hero.refine")}>
                    <SlidersHorizontal className="h-4 w-4 sm:me-2" />
                    <span className="hidden sm:inline">{t("hero.refine")}</span>
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={openGuide}
                  aria-label={t("hero.aiSuggestions")}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border/70 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:border-0"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("hero.aiSuggestions")}</span>
                </button>
              </div>
            </div>

            <p className="border-t border-border/60 pt-3 text-sm font-medium text-foreground">
              {activeMatchesCountLabel}
              {suggestions.length > 0 && <span className="ms-2 text-muted-foreground">· {nextStepsLabel}</span>}
            </p>
          </div>
        </section>

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

        {secondaryActions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {secondaryActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/70 bg-background px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <ActionIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{action.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityBadgeClass(action.severity)}`}>
                    {action.badge}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <DashboardSignalStrip headingId="job-seeker-signals" title={t("taskFirst.atAGlance")} signals={signals} />

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.72fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-5">
            <section className="card-base overflow-hidden rounded-xl max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:rounded-3xl panel-body">
              <div className="mb-3 flex flex-col gap-3 sm:mb-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("recommendedJobs.eyebrow")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight">{t("recommendedJobs.title")}</h2>
                </div>
                <Link href={`/${locale}/job-seeker/jobs`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  {t("recommendedJobs.viewAll")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {homeDataError && (
                <div className="mb-4 rounded-3xl border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] px-4 py-3 text-sm text-foreground">
                  {homeDataError}
                </div>
              )}

              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="h-36 animate-pulse rounded-3xl bg-muted/60" />
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
                    const locationLabel = formatLocalizedLocation(job.location, locale, {
                      remoteLabel: t("recommendedJobs.remote"),
                      fallback: t("recommendedJobs.locationFlexible"),
                    });
                    const fresh = Date.now() - new Date(job.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;

                    return (
                      <Link
                        key={job._id}
                        href={`/${locale}/job-seeker/jobs/${job._id}`}
                        className="group block overflow-hidden rounded-2xl border border-border/60 bg-background px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_32px_rgba(15,23,42,0.06)] sm:rounded-3xl sm:px-5 sm:py-4"
                      >
                        <div className="flex flex-col gap-2.5 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 gap-3 sm:gap-4">
                            <Avatar className="h-10 w-10 shrink-0 rounded-2xl border border-border/60 bg-muted/20 sm:h-12 sm:w-12">
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

                              <div className="mt-2 sm:mt-3">
                                <h3 className="heading-subsection font-semibold leading-5 text-foreground transition-colors group-hover:text-primary sm:leading-6">
                                  {job.title}
                                </h3>
                                <p className="mt-0.5 text-sm font-medium text-muted-foreground sm:mt-1">{companyName}</p>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:mt-3 sm:gap-x-4 sm:gap-y-2 sm:text-sm">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {locationLabel}
                                </span>
                                {formatSalary(job, numberLocale) && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" />
                                    {formatSalary(job, numberLocale)}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                                  <Sparkles className="h-3.5 w-3.5" />
                                  {t("recommendedJobs.suggestedForProfile")}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Phones get a single inline row (label · score · CTA); the
                              stacked bordered score box is kept from sm up. */}
                          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5 sm:gap-4 sm:pt-4 lg:min-w-[156px] lg:flex-col lg:items-stretch lg:border-s lg:border-t-0 lg:ps-5 lg:pt-0">
                            <div className="flex items-baseline gap-2 rounded-xl border-border/60 bg-muted/20 px-2.5 py-1.5 text-start sm:block sm:rounded-2xl sm:border sm:px-4 sm:py-3" aria-label={t("recommendedJobs.matchScoreAria", { score: formatNumber(job.matchScore) })}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">{t("recommendedJobs.matchScore")}</div>
                              <div className="text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-2xl">{formatNumber(job.matchScore)}%</div>
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
                <div className="rounded-xl sm:rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-8 sm:px-6 sm:py-12 text-center">
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
                <div className="mt-4 rounded-lg border border-border/50 bg-muted/20 sm:mt-5 sm:rounded-3xl card-pad">
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
                          href={`/${locale}/job-seeker/jobs/${app._id}`}
                          className="flex items-center gap-2 rounded-2xl border border-border/50 bg-background transition-colors hover:border-primary/20 hover:bg-muted/30 sm:gap-3 chip-pad"
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
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:text-[11px] ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="card-base overflow-hidden rounded-xl max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:rounded-3xl panel-body">
              <div className="mb-3 flex flex-col gap-3 sm:mb-5 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("priorityActions.eyebrow")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight">{t("priorityActions.title")}</h2>
                  {/* Three lines of copy above the fold on a phone — kept from sm up. */}
                  <p className="mt-1 hidden text-sm leading-6 text-muted-foreground sm:block">
                    {t("priorityActions.description")}
                  </p>
                </div>
                <Button type="button" variant="outline" className="min-h-11 rounded-full px-5" onClick={openGuide}>
                  <Sparkles className="me-2 h-4 w-4" />
                  {t("priorityActions.openAiSuggestions")}
                </Button>
              </div>

              {suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((item, index) => {
                    // All suggestions get the "suggestion" severity badge styling
                    const badgeBg = "bg-sky-100 dark:bg-sky-950/50";
                    const badgeText = "text-sky-900 dark:text-sky-200";
                    return (
                      <Link
                        key={item.id}
                        href={`/${locale}/job-seeker/${item.href}`}
                        className="flex flex-col gap-3 sm:gap-4 rounded-lg sm:rounded-3xl border border-border/60 bg-background transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between card-pad"
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-2xl bg-primary/[0.08] text-sm font-semibold text-primary">
                            {formatNumber(index + 1)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-[15px] font-semibold text-foreground">{item.title}</div>
                              <Badge className={cn("rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] hover:opacity-80", badgeBg, badgeText)}>
                                <Lightbulb className="me-1 inline h-3 w-3" />
                                {t("taskFirst.suggestion")}
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
                    );
                  })}
                </div>
              ) : (
                <div className="dashboard-surface-success rounded-2xl border text-foreground sm:rounded-3xl panel-body">
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
            <section className="card-base overflow-hidden rounded-xl sm:rounded-3xl panel-body">
              <div className="flex items-start gap-3 sm:gap-4">
                <Avatar className="h-12 w-12 shrink-0 ring-4 ring-background shadow-sm sm:h-16 sm:w-16">
                  <AvatarImage src={image} alt={name} />
                  <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground sm:text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="heading-section truncate font-semibold">{name}</h2>
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
                  <span className="font-semibold text-foreground">{formatNumber(completion)}%</span>
                </div>
                <Progress value={completion} aria-label={t("profileCard.profileCompletenessAria", { completion: formatNumber(completion) })} />
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
                <Link href={`/${locale}/job-seeker/profile`} className="flex items-center justify-between rounded-3xl border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-primary" />
                    {t("profileCard.updateProfile")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link href={`/${locale}/job-seeker/preferences`} className="flex items-center justify-between rounded-3xl border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    {t("profileCard.updatePreferences")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </section>

            <section className="card-base overflow-hidden rounded-xl sm:rounded-3xl panel-body">
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
                  title={t("a11yRefreshInsights")}
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
                <p className="rounded-2xl border border-[hsl(var(--status-shortlisted)/0.18)] bg-[hsl(var(--status-shortlisted-bg))] text-xs leading-5 text-foreground chip-pad">
                  {aiInsightsError}
                </p>
              )}

              {!aiInsightsLoading && aiInsights.length > 0 && (
                <ul className="space-y-3">
                  {aiInsights.slice(0, 3).map((insight, idx) => (
                    <li key={`${insight.type}-${insight.title}-${idx}`} className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
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
              "border-s border-border"
            )}
          >
            <div className="flex items-center justify-between panel-head">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("drawer.eyebrow")}</div>
                <h2 id="ai-guide-title" className="heading-section mt-1 font-semibold tracking-tight">{t("drawer.title")}</h2>
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
                  <div key={item.id} className="rounded-3xl border border-border/60 transition-all hover:border-primary/30 panel-body">
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
                              <><Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> {t("drawer.aiWorking")}</>
                            ) : (
                              <><Wand2 className="me-2 h-3.5 w-3.5" /> {t("drawer.fillWithAi")}</>
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
                  <div className="dashboard-surface-success rounded-3xl border text-sm text-foreground panel-body">
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
                    <div key={`${insight.type}-${insight.title}-${idx}`} className="rounded-3xl border border-border/60 panel-body">
                      <div className="text-sm font-semibold">{insight.title}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.message}</p>
                      {insight.action && (
                        <p className="mt-2 text-xs font-medium text-primary">{insight.action}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-3xl border border-border/60 bg-muted/20 panel-body">
                <div className="text-sm font-semibold">{t("drawer.howThisHelpsTitle")}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("drawer.howThisHelpsBody")}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button size="lg" asChild className="rounded-full px-5">
                  <Link href={`/${locale}/job-seeker/jobs`} onClick={closeGuide}>
                    {t("drawer.browseJobs")}
                  </Link>
                </Button>
                <Button size="lg" type="button" variant="outline" className="rounded-full px-5" onClick={closeGuide}>
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
