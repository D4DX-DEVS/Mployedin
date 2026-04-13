"use client";

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { Loader2, Sparkles, Zap, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
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

async function fetchJobs(cursor: string | null, sort: SortMode, minScore?: number): Promise<JobPage> {
  const params = new URLSearchParams({ limit: "10", sort });
  if (cursor) params.set("cursor", cursor);
  if (minScore !== undefined) params.set("min_score", String(minScore));
  const res = await fetch(`/api/jobs/recommended?${params}`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

const SEARCH_PAGE_SIZE = 20;

interface SearchResult {
  jobs: FeedJob[];
  total: number;
  pages: number;
}

async function fetchSearchJobs(q: string, page: number): Promise<SearchResult> {
  const params = new URLSearchParams({
    search: q,
    status: "active",
    limit: String(SEARCH_PAGE_SIZE),
    page: String(page),
  });
  const res = await fetch(`/api/jobs?${params}`);
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  // Map raw job docs to FeedJob shape
  const jobs: FeedJob[] = (data.jobs ?? []).map((j: Record<string, unknown>) => ({
    ...j,
    matchScore: 0,
    matchedSkills: [],
  }));
  return {
    jobs,
    total: data.total ?? 0,
    pages: Math.ceil((data.total ?? 0) / SEARCH_PAGE_SIZE),
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

  const [tab, setTab] = useState<"profile" | "like">("profile");
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FeedFilters>({
    workTypes: [],
    matchRanges: [],
    dateRanges: [],
  });

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 400);
  const isSearchMode = debouncedSearch.trim().length > 0;

  const {
    data: searchData,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ["job-search", debouncedSearch, searchPage],
    queryFn: () => fetchSearchJobs(debouncedSearch.trim(), searchPage),
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
    queryKey: ["recommended-jobs", effectiveSort, effectiveMinScore],
    queryFn: ({ pageParam }) => fetchJobs(pageParam as string | null, effectiveSort, effectiveMinScore),
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
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

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

  const visibleJobs = allJobs
    .filter((j) => !hidden.has(j._id))
    .filter((j) => passesFilters(j, filters));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="card-base !py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              Recommended for you
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Jobs matching your skills, experience & preferences
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <Badge variant="default" className="text-xs">
                {selected.size} selected
              </Badge>
            )}
            <button
              onClick={handleBulkApply}
              disabled={selected.size === 0 || bulkApplyMutation.isPending}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-md disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed transition-all"
            >
              <Zap className="h-3.5 w-3.5" />
              {bulkApplyMutation.isPending
                ? "Applying…"
                : selected.size > 0
                ? `Apply (${selected.size})`
                : "Bulk Apply"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div className="card-base !py-3">
        <div className="relative flex items-center gap-2">
          <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchPage(1);
            }}
            onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
            placeholder="Search jobs by title, skills, or keyword…"
            className="input-field w-full h-10 pl-9 pr-10 rounded-xl text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setSearchPage(1); }}
              className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      {!isSearchMode && (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const t = v as "profile" | "like";
            setTab(t);
            setSortMode(t === "like" ? "latest" : "match");
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="profile">
                Profile match
                {total > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                    {total}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="like">You might like</TabsTrigger>
            </TabsList>

            <Link
              href={`/${locale}/job-seeker/preferences`}
              className="text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
            >
              Edit Preferences →
            </Link>
          </div>
        </Tabs>
      )}

      {/* ── Body: feed + sidebar ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px] gap-5 items-start">
        {/* Feed column */}
        <div className="space-y-3">

          {/* ── Search results mode ──────────────────────────────────────── */}
          {isSearchMode ? (
            <>
              {/* Search status bar */}
              <div className="card-base !py-2.5 !px-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {searchLoading
                      ? "Searching…"
                      : searchData
                      ? `${searchData.total} result${searchData.total !== 1 ? "s" : ""} for "${debouncedSearch}"`
                      : `Results for "${debouncedSearch}"`}
                  </span>
                  {searchData && searchData.pages > 1 && (
                    <span className="text-xs text-muted-foreground">
                      Page {searchPage} of {searchData.pages}
                    </span>
                  )}
                </div>
              </div>

              {/* Search loading */}
              {searchLoading && (
                <div className="space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              )}

              {/* Search error */}
              {searchError && !searchLoading && (
                <div className="card-base text-center py-10">
                  <p className="text-sm text-muted-foreground">Search failed. Please try again.</p>
                </div>
              )}

              {/* Search empty */}
              {!searchLoading && !searchError && searchData?.jobs.length === 0 && (
                <div className="card-base text-center py-12">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
                    <Search className="h-7 w-7 text-primary/60" />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">No jobs found</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Try different keywords or check your spelling
                  </p>
                </div>
              )}

              {/* Search result cards */}
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
                      onApply={() => applyMutation.mutate(job._id)}
                      onHide={() => {
                        setHidden((s) => new Set([...s, job._id]));
                        toast.success("Job hidden");
                      }}
                      locale={locale}
                      showMatchScore={false}
                    />
                  ))}

              {/* Pagination */}
              {searchData && searchData.pages > 1 && !searchLoading && (
                <div className="flex items-center justify-center gap-3 pt-2 pb-1">
                  <button
                    onClick={() => setSearchPage((p) => Math.max(1, p - 1))}
                    disabled={searchPage <= 1}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
          {/* Sort bar */}
          <div className="card-base !py-2.5 !px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground font-medium">Sort:</span>
                <div className="flex gap-1">
                  {(["match", "latest", "salary"] as SortMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        sortMode === mode
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {SORT_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {visibleJobs.length} of {total} jobs
              </span>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="card-base text-center py-10">
              <p className="text-sm text-muted-foreground">
                Failed to load recommendations. Please try again.
              </p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && visibleJobs.length === 0 && (
            <div className="card-base text-center py-12">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
                <Search className="h-7 w-7 text-primary/60" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">No matches right now</p>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
                Try adjusting your filters or expanding your preferences to see more jobs
              </p>
              <Link
                href={`/${locale}/job-seeker/preferences`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Set Preferences
              </Link>
            </div>
          )}

          {/* Job cards */}
          {visibleJobs.map((job) => (
            <JobFeedCard
              key={job._id}
              job={job}
              isSelected={selected.has(job._id)}
              isSaved={savedIds.has(job._id)}
              isApplied={appliedIds.has(job._id)}
              onToggleSelect={() => toggleSelect(job._id)}
              onSave={() => saveMutation.mutate(job._id)}
              onApply={() => applyMutation.mutate(job._id)}
              onHide={() => {
                setHidden((s) => new Set([...s, job._id]));
                toast.success("Job hidden");
              }}
              locale={locale}
            />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
            </div>
          )}

          {/* End of list */}
          {!hasNextPage && visibleJobs.length > 0 && !isLoading && (
            <p className="text-center text-xs text-muted-foreground py-4">
              You&apos;ve seen all recommendations
            </p>
          )}
            </>
          )}
        </div>

        {/* Sidebar column — hidden on mobile, visible on tablet+ */}
        <div className="hidden lg:block sticky top-4">
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
