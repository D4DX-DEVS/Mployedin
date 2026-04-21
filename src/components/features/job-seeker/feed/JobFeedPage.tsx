"use client";

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Sparkles, Zap, Search, X, ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import Link from "next/link";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { JobFeedCard, type FeedJob } from "./JobFeedCard";
import { JobFeedSidebar, type FeedFilters } from "./JobFeedSidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortMode = "match" | "latest" | "salary";

interface JobPage {
  jobs: FeedJob[];
  nextCursor: string | null;
  total: number;
  poolPage: number;
  totalPoolPages: number;
  totalJobs: number;
}

const SORT_LABELS: Record<SortMode, string> = {
  match: "Best match",
  latest: "Latest",
  salary: "Salary",
};

const MAX_BULK = 5;

// ── Filter logic ──────────────────────────────────────────────────────────────

function passesFilters(job: FeedJob, filters: FeedFilters): boolean {
  if (filters.workTypes.length > 0) {
    const isRemote = job.location.isRemote;
    const matchesRemote = filters.workTypes.includes("remote") && isRemote;
    const matchesOnsite = filters.workTypes.includes("onsite") && !isRemote;
    if (!matchesRemote && !matchesOnsite) return false;
  }

  if (filters.matchRanges.length > 0) {
    const s = job.matchScore;
    const in80 = filters.matchRanges.includes("80+") && s >= 80;
    const in60 = filters.matchRanges.includes("60-79") && s >= 60 && s < 80;
    const inLow = filters.matchRanges.includes("below60") && s < 60;
    if (!in80 && !in60 && !inLow) return false;
  }

  if (filters.dateRanges.length > 0) {
    const age = Date.now() - new Date(job.createdAt).getTime();
    const DAY = 24 * 3600_000;
    const in3d = filters.dateRanges.includes("3days") && age <= 3 * DAY;
    const inWeek = filters.dateRanges.includes("week") && age <= 7 * DAY;
    const inMonth = filters.dateRanges.includes("month") && age <= 30 * DAY;
    if (!in3d && !inWeek && !inMonth) return false;
  }

  return true;
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchJobs(cursor: string | null, sort: SortMode, minScore?: number, poolPage = 1): Promise<JobPage> {
  const params = new URLSearchParams({ limit: "10", sort, pool_page: String(poolPage) });
  if (cursor) params.set("cursor", cursor);
  if (minScore !== undefined) params.set("min_score", String(minScore));
  const res = await fetch(`/api/jobs/recommended?${params}`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

const SEARCH_PAGE_SIZE = 20;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

interface SearchResult {
  jobs: FeedJob[];
  total: number;
  pages: number;
}

interface SearchJobsResponse {
  jobs?: Record<string, unknown>[];
  total?: number;
  pagination?: {
    total?: number;
    pages?: number;
    totalPages?: number;
  };
}

async function fetchSearchJobs(q: string, page: number, employerId?: string): Promise<SearchResult> {
  const params = new URLSearchParams({
    status: "active",
    limit: String(SEARCH_PAGE_SIZE),
    page: String(page),
  });
  if (q) params.set("search", q);
  if (employerId) params.set("employerId", employerId);
  const res = await fetch(`/api/jobs?${params}`);
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as SearchJobsResponse;
  const total = data?.pagination?.total ?? data?.total ?? 0;
  const pages = data?.pagination?.pages ?? data?.pagination?.totalPages ?? Math.ceil(total / SEARCH_PAGE_SIZE);
  // Map raw job docs to FeedJob shape
  const jobs: FeedJob[] = (data.jobs ?? []).map((j: Record<string, unknown>) => ({
    ...j,
    matchScore: 0,
    matchedSkills: [],
  })) as unknown as FeedJob[];
  return {
    jobs,
    total,
    pages,
  };
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="card-base animate-pulse">
      <div className="flex gap-3.5">
        <div className="pt-0.5">
          <div className="h-4 w-4 rounded bg-muted" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-4 w-52 rounded bg-muted" />
              <div className="h-3 w-32 rounded bg-muted" />
            </div>
            <div className="flex gap-3">
              <div className="h-6 w-20 rounded-full bg-muted" />
              <div className="h-11 w-11 rounded-xl bg-muted" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="h-3.5 w-20 rounded bg-muted" />
            <div className="h-3.5 w-28 rounded bg-muted" />
            <div className="h-3.5 w-24 rounded bg-muted" />
          </div>
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
          <div className="flex gap-1.5">
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="h-5 w-14 rounded-full bg-muted" />
            <div className="h-5 w-18 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function JobFeedPage({ locale }: { locale: string }) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const employerIdParam = searchParams.get("employerId")?.trim() ?? "";
  const employerIdFilter = OBJECT_ID_PATTERN.test(employerIdParam) ? employerIdParam : "";

  const [tab, setTab] = useState<"profile" | "like">("profile");
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [poolPage, setPoolPage] = useState(1);
  const [filters, setFilters] = useState<FeedFilters>({
    workTypes: [],
    matchRanges: [],
    dateRanges: [],
  });

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 400);
  const isSearchMode = debouncedSearch.trim().length > 0 || employerIdFilter.length > 0;

  const {
    data: searchData,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ["job-search", debouncedSearch, searchPage, employerIdFilter],
    queryFn: () => fetchSearchJobs(debouncedSearch.trim(), searchPage, employerIdFilter || undefined),
    enabled: isSearchMode,
    staleTime: 2 * 60_000,
  });

  const effectiveSort: SortMode = tab === "like" ? "latest" : sortMode;
  const effectiveMinScore = tab === "like" ? 0 : undefined;

  // ── Data fetching ───────────────────────────────────────────────────────────

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["recommended-jobs", effectiveSort, effectiveMinScore, poolPage],
    queryFn: ({ pageParam }) => fetchJobs(pageParam as string | null, effectiveSort, effectiveMinScore, poolPage),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        { rootMargin: "0px 0px 300px 0px" },
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  // ── Subscription gate ────────────────────────────────────────────────────────
  const { allowed: applyAllowed } = useFeatureGate("applicationsSubmitted");

  // ── Mutations ───────────────────────────────────────────────────────────────

  const applyMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetch(`/api/jobs/${jobId}/apply`, { method: "POST" }).then((r) => {
        if (!r.ok)
          return r.json().then((d: { error?: string }) => Promise.reject(d.error ?? "Failed"));
        return r.json();
      }),
    onMutate: (jobId) => setAppliedIds((s) => new Set([...s, jobId])),
    onSuccess: () => {
      toast.success("Application submitted!");
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: unknown, jobId) => {
      setAppliedIds((s) => {
        const n = new Set(s);
        n.delete(jobId);
        return n;
      });
      toast.error(typeof err === "string" ? err : "Failed to apply");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetch(`/api/jobs/${jobId}/save`, { method: "POST" }).then((r) => r.json()),
    onMutate: (jobId) => {
      setSavedIds((s) => {
        const n = new Set(s);
        n.has(jobId) ? n.delete(jobId) : n.add(jobId);
        return n;
      });
    },
    onSuccess: (data: { saved: boolean }, jobId) => {
      toast.success(data.saved ? "Job saved" : "Job unsaved");
      data.saved
        ? setSavedIds((s) => new Set([...s, jobId]))
        : setSavedIds((s) => {
            const n = new Set(s);
            n.delete(jobId);
            return n;
          });
    },
    onError: () => toast.error("Failed to update saved jobs"),
  });

  const bulkApplyMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      const results = await Promise.allSettled(
        jobIds.map((id) =>
          fetch(`/api/jobs/${id}/apply`, { method: "POST" }).then((r) => {
            if (!r.ok) throw new Error("fail");
            return r.json();
          }),
        ),
      );
      return results;
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.status === "fulfilled").length;
      if (ok > 0) toast.success(`Applied to ${ok} job${ok > 1 ? "s" : ""}!`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recommended-jobs"] });
    },
    onError: () => toast.error("Bulk apply failed"),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  function toggleSelect(jobId: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(jobId)) {
        n.delete(jobId);
      } else {
        if (n.size >= MAX_BULK) {
          toast.error(`You can select up to ${MAX_BULK} jobs`);
          return prev;
        }
        n.add(jobId);
      }
      return n;
    });
  }

  function handleBulkApply() {
    if (selected.size === 0) return;
    const ids = [...selected].filter((id) => !appliedIds.has(id));
    if (ids.length === 0) {
      toast.error("All selected jobs are already applied");
      return;
    }
    setAppliedIds((s) => new Set([...s, ...ids]));
    bulkApplyMutation.mutate(ids);
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const allJobs = data?.pages.flatMap((p) => p.jobs) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const totalPoolPages = data?.pages[0]?.totalPoolPages ?? 1;
  const totalJobs = data?.pages[0]?.totalJobs ?? 0;
  const hasMorePoolPages = poolPage < totalPoolPages;
  const activeFilterCount =
    filters.workTypes.length + filters.matchRanges.length + filters.dateRanges.length;

  const visibleJobs = allJobs
    .filter((j) => !hidden.has(j._id))
    .filter((j) => passesFilters(j, filters));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[30px] border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.05] px-5 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_300px] xl:items-start">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI Job Matching
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  Browse AI-matched jobs faster.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  AI scores every role against your profile. Switch to discovery mode and apply in bulk without leaving the dashboard.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Live matches
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {isSearchMode ? searchData?.total ?? 0 : totalJobs}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isSearchMode ? "jobs returned for this search" : "jobs aligned to your profile"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ready to apply
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {selected.size}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  saved in the current bulk-apply tray
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Filter signal
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {activeFilterCount}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  active filter{activeFilterCount === 1 ? "" : "s"} shaping the list
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-[60%] text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchPage(1);
                  }}
                  onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                  placeholder="Search jobs by title, skills, or keyword..."
                  aria-label="Search jobs"
                  style={{ paddingLeft: "2.25rem" }}
                  className="input-field h-12 w-full rounded-2xl border-border/70 bg-background/95 pr-12 text-sm shadow-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchPage(1);
                    }}
                    className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Link
                  href={`/${locale}/job-seeker/preferences`}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-border/70 bg-background/90 px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  Refine preferences
                </Link>
              </div>
            </div>
          </div>

          <aside className="rounded-[26px] border border-border/70 bg-background/95 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  AI-powered search
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  Keep the list relevant.
                </h2>
              </div>
              <div className="rounded-2xl bg-primary/[0.08] p-2 text-primary">
                <Search className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Best for
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">
                  Profile match for strong-fit roles, discovery for fresh openings.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick control
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">
                  Press Escape to clear the search box instantly.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Focus mode
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {activeFilterCount > 0
                    ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"} are tightening the feed right now.`
                    : "Add work type, match score, or date filters for a tighter shortlist."}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {!isSearchMode && (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const t = v as "profile" | "like";
            setTab(t);
            setSortMode(t === "like" ? "latest" : "match");
            setPoolPage(1);
          }}
        >
          <div className="flex flex-col gap-3 rounded-[24px] border border-border/60 bg-card px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                AI Matching
              </div>
              <TabsList className="mt-3 h-auto rounded-full border border-border/60 bg-muted/30 p-1">
                <TabsTrigger value="profile" className="rounded-full px-4 py-2 text-xs sm:text-sm">
                  AI Profile Match
                  {total > 0 && (
                    <Badge variant="secondary" className="ml-1.5 rounded-full px-1.5 py-0 text-[10px]">
                      {total}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="like" className="rounded-full px-4 py-2 text-xs sm:text-sm">
                  You might like
                </TabsTrigger>
              </TabsList>
            </div>

            <Link
              href={`/${locale}/job-seeker/preferences`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              Edit preferences
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </Tabs>
      )}

      <div className="grid grid-cols-1 gap-5 items-start lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {isSearchMode ? (
            <>
              <div className="rounded-[24px] border border-border/60 bg-card px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)] sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      Search results
                    </div>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {searchLoading
                        ? "Searching..."
                        : searchData
                        ? debouncedSearch.trim().length > 0
                          ? `${searchData.total} result${searchData.total !== 1 ? "s" : ""} for "${debouncedSearch}"`
                          : `${searchData.total} active role${searchData.total !== 1 ? "s" : ""} from this employer`
                        : debouncedSearch.trim().length > 0
                          ? `Results for "${debouncedSearch}"`
                          : "Employer roles"}
                    </span>
                  </div>
                  {searchData && searchData.pages > 1 && (
                    <span className="text-xs text-muted-foreground">
                      Page {searchPage} of {searchData.pages}
                    </span>
                  )}
                </div>
              </div>

              {searchLoading && (
                <div className="space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              )}

              {searchError && !searchLoading && (
                <div className="card-base rounded-[24px] py-10 text-center">
                  <p className="text-sm text-muted-foreground">Search failed. Please try again.</p>
                </div>
              )}

              {!searchLoading && !searchError && searchData?.jobs.length === 0 && (
                <div className="card-base rounded-[26px] py-12 text-center">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Search className="h-7 w-7 text-primary/60" />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-foreground">No jobs found</p>
                  <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                    Try different keywords or check your spelling
                  </p>
                </div>
              )}

              {!searchLoading &&
                searchData?.jobs
                  .filter((j) => !hidden.has(j._id))
                  .filter((j) => passesFilters(j, filters))
                  .map((job) => (
                    <JobFeedCard
                      key={job._id}
                      job={job}
                      isSelected={selected.has(job._id)}
                      isSaved={savedIds.has(job._id)}
                      isApplied={appliedIds.has(job._id)}
                      onToggleSelect={() => toggleSelect(job._id)}
                      onSave={() => saveMutation.mutate(job._id)}
                      onApply={() => applyAllowed ? applyMutation.mutate(job._id) : toast.error("Application limit reached — upgrade your plan")}
                      onHide={() => {
                        setHidden((s) => new Set([...s, job._id]));
                        toast.success("Job hidden");
                      }}
                      locale={locale}
                      showMatchScore={false}
                    />
                  ))}

              {searchData && searchData.pages > 1 && !searchLoading && (
                <div className="flex items-center justify-center gap-3 pb-1 pt-2">
                  <button
                    onClick={() => setSearchPage((p) => Math.max(1, p - 1))}
                    disabled={searchPage <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {searchPage} / {searchData.pages}
                  </span>
                  <button
                    onClick={() => setSearchPage((p) => Math.min(searchData.pages, p + 1))}
                    disabled={searchPage >= searchData.pages}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-[24px] border border-border/60 bg-card px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)] sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Sort
                    </span>
                    <div className="flex gap-1">
                      {(["match", "latest", "salary"] as SortMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => { setSortMode(mode); setPoolPage(1); }}
                          className={`rounded-full px-3.5 py-2 text-xs font-medium transition-all ${
                            sortMode === mode
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                        >
                          {SORT_LABELS[mode]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {visibleJobs.length} of {totalJobs} jobs{totalPoolPages > 1 ? ` · Page ${poolPage}/${totalPoolPages}` : ""}
                  </span>
                </div>
              </div>

              {isLoading && (
                <div className="space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              )}

              {error && !isLoading && (
                <div className="card-base rounded-[24px] py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Failed to load recommendations. Please try again.
                  </p>
                </div>
              )}

              {!isLoading && !error && visibleJobs.length === 0 && (
                <div className="card-base rounded-[26px] py-12 text-center">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Search className="h-7 w-7 text-primary/60" />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-foreground">No matches right now</p>
                  <p className="mx-auto mb-4 max-w-xs text-xs text-muted-foreground">
                    Try adjusting your filters or expanding your preferences to see more jobs
                  </p>
                  <Link
                    href={`/${locale}/job-seeker/preferences`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Set Preferences
                  </Link>
                </div>
              )}

              {visibleJobs.map((job) => (
                <JobFeedCard
                  key={job._id}
                  job={job}
                  isSelected={selected.has(job._id)}
                  isSaved={savedIds.has(job._id)}
                  isApplied={appliedIds.has(job._id)}
                  onToggleSelect={() => toggleSelect(job._id)}
                  onSave={() => saveMutation.mutate(job._id)}
                  onApply={() => applyAllowed ? applyMutation.mutate(job._id) : toast.error("Application limit reached — upgrade your plan")}
                  onHide={() => {
                    setHidden((s) => new Set([...s, job._id]));
                    toast.success("Job hidden");
                  }}
                  locale={locale}
                />
              ))}

              <div ref={sentinelRef} className="h-1" />
              {isFetchingNextPage && (
                <div className="space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              )}

              {/* Pool page navigation — shown when infinite scroll within pool is exhausted */}
              {!hasNextPage && visibleJobs.length > 0 && !isLoading && (
                <div className="rounded-[24px] border border-border/60 bg-card px-4 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)] sm:px-5">
                  {hasMorePoolPages ? (
                    <div className="space-y-4">
                      <p className="text-center text-sm text-muted-foreground">
                        Showing page {poolPage} of {totalPoolPages} ({visibleJobs.length} of {totalJobs} jobs)
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        {poolPage > 1 && (
                          <button
                            onClick={() => {
                              setPoolPage((p) => p - 1);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/80 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous page
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setPoolPage((p) => p + 1);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                        >
                          Next page
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-center text-sm text-muted-foreground">
                        You&apos;ve seen all {totalJobs} recommendations
                      </p>
                      {poolPage > 1 && (
                        <div className="flex justify-center">
                          <button
                            onClick={() => {
                              setPoolPage(1);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/80 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <ArrowUp className="h-4 w-4" />
                            Back to page 1
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky top-4 hidden lg:block">
          <JobFeedSidebar
            filters={filters}
            onFiltersChange={setFilters}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
