"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Search, MapPin, DollarSign, Briefcase, Filter, X, Clock,
  Building2, Bookmark, BookmarkCheck, Sparkles, Globe, Loader2,
  Heart, FileText, ArrowLeft, Zap, ChevronRight, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IJobLocation { country: string; city: string; isRemote: boolean; }

interface Job {
  _id: string;
  title: string;
  location: IJobLocation;
  description: string;
  requirements: { skills: string[]; experienceMin: number };
  salary: { min: number; max: number; currency: string };
  employerId: {
    _id?: string; companyName?: string; country?: string;
    industry?: string; logo?: string;
  } | null;
  createdAt: string;
  expiresAt?: string;
  tags?: string[];
}

interface RecommendedJob extends Job { matchScore: number; }

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_CATEGORIES = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality",
  "Education", "Manufacturing", "Logistics", "Oil & Gas", "Retail", "Other",
];

const CURRENCIES = ["USD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR"];

const POPULAR_ROLES = [
  "Frontend Developer", "React Developer", "Full Stack Engineer",
  "UI/UX Designer", "Product Manager", "Data Analyst",
  "DevOps Engineer", "Software Engineer", "Marketing Manager",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobSearchPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  // Search & filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("all");
  const [remoteOnly, setRemoteOnly] = useState(false);

  // Data
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<RecommendedJob[]>([]);
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
  const [savedJobEntries, setSavedJobEntries] = useState<{ _id: string; jobId: string }[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  // Loading
  const [loading, setLoading] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [showSaved, setShowSaved] = useState(false);
  const [savedJobsList, setSavedJobsList] = useState<Job[]>([]);

  const pgn = usePagination();

  const isSearchActive =
    debouncedSearch.trim() !== "" ||
    category !== "all" ||
    !!location ||
    currency !== "all" ||
    remoteOnly;

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = "Discover Jobs · MPLOYEDIN";
    loadRecommended();
    fetchApplied();
    fetchSavedJobs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch jobs when search active
  useEffect(() => {
    if (isSearchActive) fetchJobs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, location, currency, remoteOnly, pgn.page, pgn.limit]);

  // Reset to page 1 when filters change
  useEffect(() => {
    pgn.resetPage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, location, currency, remoteOnly]);

  // ── Data Loaders ────────────────────────────────────────────────────────────

  async function loadRecommended() {
    try {
      const r = await fetch("/api/job-seeker/recommended-jobs");
      if (r.ok) {
        const data = await r.json();
        const items: RecommendedJob[] = data.items ?? [];
        setRecommendedJobs(items);
        const map: Record<string, number> = {};
        items.forEach((j) => { map[j._id] = j.matchScore; });
        setScoreMap(map);
      }
    } catch { /* silent */ }
    setLoadingRecs(false);
  }

  async function fetchApplied() {
    try {
      const res = await fetch("/api/applications?limit=200");
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>(
          data.applications.map((a: { jobId: { _id: string } | string }) =>
            typeof a.jobId === "object" ? a.jobId._id : a.jobId
          )
        );
        setAppliedJobs(ids);
      }
    } catch { /* silent */ }
  }

  async function fetchSavedJobs() {
    try {
      const res = await fetch("/api/saved-jobs?limit=200");
      if (res.ok) {
        const data = await res.json();
        const entries = data.items.map((s: { _id: string; jobId: { _id: string } | string }) => ({
          _id: s._id,
          jobId: typeof s.jobId === "object" ? s.jobId._id : s.jobId,
        }));
        setSavedJobEntries(entries);
        setSavedJobs(new Set<string>(entries.map((e: { jobId: string }) => e.jobId)));
        setSavedCount(entries.length);
        // Also store full job objects if populated
        const populated = data.items
          .filter((s: { jobId: object | string }) => typeof s.jobId === "object")
          .map((s: { jobId: Job }) => s.jobId);
        if (populated.length > 0) setSavedJobsList(populated);
      }
    } catch { /* silent */ }
  }

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = pgn.paginationParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category && category !== "all") params.set("category", category);
      if (location) params.set("location", location);
      if (currency && currency !== "all") params.set("currency", currency);
      if (remoteOnly) params.set("remote", "true");

      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
        pgn.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, location, currency, remoteOnly, pgn.page, pgn.limit]);

  async function toggleSaveJob(jobId: string) {
    if (savedJobs.has(jobId)) {
      const entry = savedJobEntries.find((e) => e.jobId === jobId);
      if (entry) {
        try {
          await fetch(`/api/saved-jobs/${entry._id}`, { method: "DELETE" });
          setSavedJobs((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
          setSavedJobEntries((prev) => prev.filter((e) => e._id !== entry._id));
          setSavedCount((c) => c - 1);
        } catch { /* silent */ }
      }
    } else {
      try {
        const res = await fetch("/api/saved-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        if (res.ok) {
          const data = await res.json();
          const newEntry = { _id: data._id ?? data.item?._id ?? jobId, jobId };
          setSavedJobs((prev) => new Set([...prev, jobId]));
          setSavedJobEntries((prev) => [...prev, newEntry]);
          setSavedCount((c) => c + 1);
        }
      } catch { /* silent */ }
    }
  }

  async function applyToJob(jobId: string) {
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) {
      setAppliedJobs((prev) => new Set([...prev, jobId]));
    }
  }

  function clearAll() {
    setSearch("");
    setDebouncedSearch("");
    setCategory("all");
    setLocation("");
    setCurrency("all");
    setRemoteOnly(false);
    setShowFilters(false);
  }

  const activeFilterCount = [
    category !== "all",
    !!location,
    currency !== "all",
    remoteOnly,
  ].filter(Boolean).length;

  // ── Job Card ────────────────────────────────────────────────────────────────

  function JobCard({ job }: { job: Job }) {
    const isApplied = appliedJobs.has(job._id);
    const isSaved = savedJobs.has(job._id);
    const matchScore = scoreMap[job._id];
    const daysAgo = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86400000);
    const locationStr = job.location
      ? [job.location.city, job.location.country].filter(Boolean).join(", ")
      : "";

    return (
      <div
        className="card-base hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
        onClick={() => router.push(`/${locale}/job-seeker/jobs/${job._id}`)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {job.title}
              </h3>
              {daysAgo === 0 && (
                <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">
                  New
                </Badge>
              )}
              {job.location?.isRemote && (
                <Badge variant="outline" className="text-xs shrink-0">
                  <Globe className="w-3 h-3 me-1" />Remote
                </Badge>
              )}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mb-3">
              {job.employerId?.companyName && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />{job.employerId.companyName}
                </span>
              )}
              {locationStr && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{locationStr}
                </span>
              )}
              {(job.salary?.min ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {job.salary.min.toLocaleString()}–{job.salary.max.toLocaleString()} {job.salary.currency}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}
              </span>
            </div>

            {/* Description */}
            {job.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{job.description}</p>
            )}

            {/* Skills */}
            {(job.requirements?.skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {job.requirements.skills.slice(0, 5).map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                ))}
                {job.requirements.skills.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{job.requirements.skills.length - 5}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Right col: match score + actions */}
          <div
            className="shrink-0 flex flex-col items-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {matchScore !== undefined && (
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  matchScore >= 70
                    ? "bg-emerald-100 text-emerald-700"
                    : matchScore >= 40
                    ? "bg-amber-100 text-amber-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                <Zap className="w-3 h-3" />{Math.round(matchScore)}% match
              </div>
            )}

            <div className="flex items-center gap-2 mt-auto pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => toggleSaveJob(job._id)}
                title={isSaved ? "Remove from saved" : "Save job"}
              >
                {isSaved
                  ? <BookmarkCheck className="h-4 w-4 text-primary" />
                  : <Bookmark className="h-4 w-4" />
                }
              </Button>
              {isApplied ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Applied ✓</Badge>
              ) : (
                <Button size="sm" onClick={() => applyToJob(job._id)}>Apply Now</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Recommended Section ─────────────────────────────────────────────────────

  function RecommendedSection() {
    if (loadingRecs) {
      return (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Recommended for You</h2>
          </div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card-base animate-pulse">
                <div className="h-5 bg-muted rounded w-1/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/4 mb-4" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (recommendedJobs.length === 0) {
      return (
        <section className="card-base text-center py-14">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-semibold text-lg mb-1">Start your job search</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            We'll recommend jobs based on your skills and preferences once your profile is set up.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href={`/${locale}/job-seeker/cv`}>
              <Button size="sm">
                <FileText className="w-3.5 h-3.5 me-1.5" />Upload Resume
              </Button>
            </Link>
            <Link href={`/${locale}/job-seeker/preferences`}>
              <Button variant="outline" size="sm">
                Set Job Preferences
              </Button>
            </Link>
          </div>
        </section>
      );
    }

    return (
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Recommended for You</h2>
            <Badge variant="secondary" className="text-xs">{recommendedJobs.length} matches</Badge>
          </div>
          <Link href={`/${locale}/job-seeker/preferences`}>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              Improve matches <ChevronRight className="w-3 h-3 ms-1" />
            </Button>
          </Link>
        </div>
        <div className="space-y-3">
          {recommendedJobs.map((job) => (
            <JobCard key={job._id} job={job} />
          ))}
        </div>
      </section>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title={showSaved ? "Saved Jobs" : "Discover Jobs"}
          description={showSaved ? "Jobs you bookmarked" : "Smart job matching powered by your profile"}
        />
        <Button
          variant={showSaved ? "default" : "outline"}
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => setShowSaved((v) => !v)}
        >
          <Heart className={`w-4 h-4 ${showSaved ? "" : "text-rose-500"}`} />
          Saved Jobs
          {savedCount > 0 && (
            <Badge className="bg-primary text-primary-foreground text-xs px-1.5 py-0 min-w-[1.25rem] rounded-full">
              {savedCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* ── Saved Jobs view ── */}
      {showSaved && (
        <div className="space-y-3">
          {savedJobsList.length === 0 ? (
            <div className="card-base text-center py-14">
              <Heart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No saved jobs yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Bookmark jobs you like and they will appear here
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowSaved(false)}>
                <ArrowLeft className="w-3.5 h-3.5 me-1.5" />Back to Discover
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{savedJobsList.length} saved job{savedJobsList.length !== 1 ? "s" : ""}</p>
              {savedJobsList.map((job) => <JobCard key={job._id} job={job} />)}
            </>
          )}
        </div>
      )}

      {!showSaved && (
        <>
      {/* ── Search bar ── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Job title, skills, keywords…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-11 h-12 text-base"
          />
          {search && (
            <button
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          onClick={() => setShowFilters(!showFilters)}
          className="h-12 relative"
        >
          <Filter className="w-4 h-4 me-2" />Filters
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -end-1.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-semibold">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* ── Popular roles (discovery mode only) ── */}
      {!isSearchActive && !showFilters && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Popular searches</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => setSearch(role)}
                className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:bg-accent hover:border-primary/50 transition-colors"
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Smart filters panel ── */}
      {showFilters && (
        <div className="card-base grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {JOB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Location</label>
            <Input
              placeholder="e.g. Dubai, Riyadh…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Salary currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue placeholder="Any currency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any currency</SelectItem>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Remote work</label>
            <div className="flex items-center gap-3 mt-2">
              <Switch checked={remoteOnly} onCheckedChange={setRemoteOnly} />
              <span className="text-sm text-muted-foreground">
                {remoteOnly ? "Remote only" : "All locations"}
              </span>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="w-3 h-3 me-1" />Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Active filter chips ── */}
      {isSearchActive && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">
            {pgn.total.toLocaleString()} result{pgn.total !== 1 ? "s" : ""}
          </span>
          {debouncedSearch && (
            <Badge
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => setSearch("")}
            >
              &ldquo;{debouncedSearch}&rdquo;<X className="w-3 h-3" />
            </Badge>
          )}
          {category !== "all" && (
            <Badge
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => setCategory("all")}
            >
              {category}<X className="w-3 h-3" />
            </Badge>
          )}
          {location && (
            <Badge
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => setLocation("")}
            >
              <MapPin className="w-3 h-3" />{location}<X className="w-3 h-3" />
            </Badge>
          )}
          {remoteOnly && (
            <Badge
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => setRemoteOnly(false)}
            >
              <Globe className="w-3 h-3" />Remote<X className="w-3 h-3" />
            </Badge>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      {isSearchActive ? (
        /* Search results */
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-base animate-pulse">
                <div className="h-5 bg-muted rounded w-1/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/4 mb-4" />
                <div className="h-3 bg-muted rounded w-full mb-1" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))
          ) : jobs.length > 0 ? (
            jobs.map((job) => <JobCard key={job._id} job={job} />)
          ) : (
            /* Empty state */
            <div className="card-base text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">No jobs found</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Try different keywords or remove some filters
              </p>
              <div className="bg-muted/50 rounded-xl p-5 max-w-sm mx-auto mb-5">
                <p className="text-sm font-semibold mb-1">💡 Improve your match</p>
                <p className="text-xs text-muted-foreground mb-4">
                  A complete profile gets 3× more job matches
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Link href={`/${locale}/job-seeker/skills`}>
                    <Button variant="outline" size="sm">
                      <Users className="w-3.5 h-3.5 me-1.5" />Add Skills
                    </Button>
                  </Link>
                  <Link href={`/${locale}/job-seeker/cv`}>
                    <Button variant="outline" size="sm">
                      <FileText className="w-3.5 h-3.5 me-1.5" />Upload Resume
                    </Button>
                  </Link>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <ArrowLeft className="w-4 h-4 me-1.5" />Back to Discover
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Discovery mode */
        <div className="space-y-8">
          <RecommendedSection />

          {/* Browse all CTA strip */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Browse all jobs</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Search above or pick a category to get started
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {["Technology", "Healthcare", "Finance"].map((cat) => (
                <Button
                  key={cat}
                  variant="outline"
                  size="sm"
                  onClick={() => { setCategory(cat); setShowFilters(false); }}
                >
                  {cat}<ChevronRight className="w-3.5 h-3.5 ms-1.5" />
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pagination (search mode only) ── */}
      {isSearchActive && !loading && jobs.length > 0 && (
        <PaginationControls
          page={pgn.page}
          totalPages={pgn.totalPages}
          total={pgn.total}
          limit={pgn.limit}
          onPageChange={pgn.setPage}
          onLimitChange={pgn.setLimit}
        />
      )}
      </>
      )}
    </div>
  );
}

