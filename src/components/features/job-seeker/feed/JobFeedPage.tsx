"use client";

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, Zap, Search, X, ChevronLeft, ChevronRight, ArrowUp, BookmarkPlus } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import Link from "next/link";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { Button } from "@/components/ui/button";

import { JobFeedCard, type FeedJob } from "./JobFeedCard";
import { JobFeedSidebar, type FeedFilters } from "./JobFeedSidebar";
import { EasyApplyFlowDialog } from "./EasyApplyFlowDialog";
import { SaveSearchDialog } from "./SaveSearchDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortMode = "match" | "latest" | "salary";

interface JobPage {
  jobs: FeedJob[];
  nextCursor: string | null;
  total: number;
  poolPage: number;
  totalPoolPages: number;
  totalJobs: number;
  matchedCount: number;
  strongMatches: number;
  newThisWeek: number;
}

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

  if (filters.experienceLevels.length > 0) {
    const min = job.requirements.experienceMin ?? 0;
    const entry = filters.experienceLevels.includes("entry") && min < 3;
    const mid = filters.experienceLevels.includes("mid") && min >= 3 && min < 6;
    const senior = filters.experienceLevels.includes("senior") && min >= 6;
    if (!entry && !mid && !senior) return false;
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

/**
 * Fetch the set of job IDs the seeker has already applied to, so the feed can
 * render an "Applied" state even for jobs surfaced via search (where the
 * recommended feed's auto-exclusion does not apply).
 */
async function fetchAppliedJobIds(): Promise<string[]> {
  const res = await fetch(`/api/applications?limit=100`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    applications?: Array<{ status?: string; jobId?: { _id?: string } | string }>;
  };
  return (data.applications ?? [])
    // Withdrawn applications can be re-applied to, so they don't count as "applied".
    .filter((a) => a.status !== "withdrawn")
    .map((a) => (typeof a.jobId === "object" ? a.jobId?._id : a.jobId))
    .filter((id): id is string => Boolean(id));
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
  const t = useTranslations("jobFeed");
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const employerIdParam = searchParams.get("employerId")?.trim() ?? "";
  const employerIdFilter = OBJECT_ID_PATTERN.test(employerIdParam) ? employerIdParam : "";

  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [applyJob, setApplyJob] = useState<FeedJob | null>(null);
  const [poolPage, setPoolPage] = useState(1);
  const [filters, setFilters] = useState<FeedFilters>({
    workTypes: [],
    matchRanges: [],
    dateRanges: [],
    experienceLevels: [],
  });

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 400);
  const isSearchMode = debouncedSearch.trim().length > 0 || employerIdFilter.length > 0;
  // Only one experience/work-type selection maps cleanly onto a saved search's
  // single-value filters; otherwise leave it for the user to pick in the dialog.
  const prefillExperience = filters.experienceLevels.length === 1 ? filters.experienceLevels[0] : "";
  const prefillWorkType = filters.workTypes.length === 1 ? filters.workTypes[0] : "";
  // A saved search needs a text query; hide the action in employer-only browse.
  const canSaveSearch = debouncedSearch.trim().length > 0;

  // Hydrate already-applied job IDs so the "Applied" state shows on first load,
  // including for jobs surfaced through search (not just the recommended feed).
  const { data: appliedIdsData } = useQuery({
    queryKey: ["applied-job-ids"],
    queryFn: fetchAppliedJobIds,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (appliedIdsData?.length) {
      setAppliedIds((s) => new Set([...s, ...appliedIdsData]));
    }
  }, [appliedIdsData]);

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

  const effectiveSort: SortMode = sortMode;
  const effectiveMinScore = undefined;

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
        // Prefetch the next batch ~1200px before the sentinel enters view so the
        // feed loads ahead of the scroll position and never feels stuck.
        { rootMargin: "0px 0px 1200px 0px" },
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  // ── Subscription gate ────────────────────────────────────────────────────────
  const { allowed: applyAllowed } = useFeatureGate("applicationsSubmitted");
  const sortLabels: Record<SortMode, string> = {
    match: t("sort.bestMatch"),
    latest: t("sort.latest"),
    salary: t("sort.salary"),
  };

  // ── Mutations ───────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (jobId: string) =>
      csrfFetch(`/api/jobs/${jobId}/save`, { method: "POST" }).then((r) => r.json()),
    onMutate: (jobId) => {
      setSavedIds((s) => {
        const n = new Set(s);
        n.has(jobId) ? n.delete(jobId) : n.add(jobId);
        return n;
      });
    },
    onSuccess: (data: { saved: boolean }, jobId) => {
      toast.success(data.saved ? t("toast.jobSaved") : t("toast.jobUnsaved"));
      data.saved
        ? setSavedIds((s) => new Set([...s, jobId]))
        : setSavedIds((s) => {
            const n = new Set(s);
            n.delete(jobId);
            return n;
          });
    },
    onError: () => toast.error(t("toast.savedUpdateFailed")),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleApply(job: FeedJob) {
    if (!applyAllowed) {
      toast.error(t("toast.applicationLimitReached"));
      return;
    }
    setApplyJob(job);
  }

  function handleApplied(jobId: string) {
    setAppliedIds((s) => new Set([...s, jobId]));
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const allJobs = data?.pages.flatMap((p) => p.jobs) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const totalPoolPages = data?.pages[0]?.totalPoolPages ?? 1;
  const totalJobs = data?.pages[0]?.totalJobs ?? 0;
  const matchedCount = data?.pages[0]?.matchedCount ?? 0;
  const strongMatches = data?.pages[0]?.strongMatches ?? 0;
  const newThisWeek = data?.pages[0]?.newThisWeek ?? 0;
  const hasMorePoolPages = poolPage < totalPoolPages;

  const visibleJobs = allJobs
    .filter((j) => !hidden.has(j._id))
    .filter((j) => passesFilters(j, filters));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl sm:rounded-[30px] border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.05] px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <div className="space-y-5">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {t("hero.badge")}
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                  {t("hero.title")}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {t("hero.description")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("stats.liveMatches")}
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {isSearchMode ? searchData?.total ?? 0 : matchedCount}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isSearchMode ? t("stats.searchReturned") : t("stats.profileAligned")}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("stats.strongMatches")}
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {strongMatches}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("stats.strongMatchesHint")}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("stats.newThisWeek")}
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {newThisWeek}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("stats.newThisWeekHint")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchPage(1);
                  }}
                  onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.ariaLabel")}
                  style={{ paddingInlineStart: "2.75rem", paddingInlineEnd: "3rem" }}
                  className="input-field h-12 w-full rounded-2xl border-border/70 bg-background/95 text-sm shadow-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchPage(1);
                    }}
                    className="absolute end-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={t("search.clear")}
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
                  {t("actions.refinePreferences")}
                </Link>
              </div>
            </div>
          </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:gap-5 items-start lg:grid-cols-[1fr_250px] xl:grid-cols-[1fr_280px]">
        <div className="space-y-3 sm:space-y-4">
          {isSearchMode ? (
            <>
              <div className="rounded-lg sm:rounded-[24px] border border-border/60 bg-card px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.04)] sm:px-4 sm:py-4 lg:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      {t("search.results")}
                    </div>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {searchLoading
                        ? t("search.searching")
                        : searchData
                        ? debouncedSearch.trim().length > 0
                          ? t("search.resultsFor", { count: searchData.total, query: debouncedSearch })
                          : t("search.employerActiveRoles", { count: searchData.total })
                        : debouncedSearch.trim().length > 0
                          ? t("search.pendingResultsFor", { query: debouncedSearch })
                          : t("search.employerRoles")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    {searchData && searchData.pages > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {t("pagination.pageOf", { page: searchPage, pages: searchData.pages })}
                      </span>
                    )}
                    {canSaveSearch && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSaveSearchOpen(true)}
                        className="gap-1.5 rounded-full"
                      >
                        <BookmarkPlus className="h-4 w-4" />
                        {t("saveSearch.button")}
                      </Button>
                    )}
                  </div>
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
                <div className="card-base rounded-lg sm:rounded-[24px] py-6 sm:py-10 text-center">
                  <p className="text-sm text-muted-foreground">{t("errors.searchFailed")}</p>
                </div>
              )}

              {!searchLoading && !searchError && searchData?.jobs.length === 0 && (
                <div className="card-base rounded-lg sm:rounded-[26px] py-8 sm:py-12 text-center">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Search className="h-7 w-7 text-primary/60" />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-foreground">{t("empty.noJobs")}</p>
                  <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                    {t("empty.noJobsHint")}
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
                      isSaved={savedIds.has(job._id)}
                      isApplied={appliedIds.has(job._id)}
                      onSave={() => saveMutation.mutate(job._id)}
                      onApply={() => handleApply(job)}
                      onHide={() => {
                        setHidden((s) => new Set([...s, job._id]));
                        toast.success(t("toast.jobHidden"));
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
                    {t("pagination.previous")}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {searchPage} / {searchData.pages}
                  </span>
                  <button
                    onClick={() => setSearchPage((p) => Math.min(searchData.pages, p + 1))}
                    disabled={searchPage >= searchData.pages}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("pagination.next")}
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
                      {t("sort.label")}
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
                          {sortLabels[mode]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {totalPoolPages > 1
                      ? t("sort.countWithPage", { visible: visibleJobs.length, total: totalJobs, page: poolPage, pages: totalPoolPages })
                      : t("sort.count", { visible: visibleJobs.length, total: totalJobs })}
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
                <div className="card-base rounded-lg sm:rounded-[24px] py-6 sm:py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("errors.recommendationsFailed")}
                  </p>
                </div>
              )}

              {!isLoading && !error && visibleJobs.length === 0 && (
                <div className="card-base rounded-lg sm:rounded-[26px] py-8 sm:py-12 text-center">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Search className="h-7 w-7 text-primary/60" />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-foreground">{t("empty.noMatches")}</p>
                  <p className="mx-auto mb-4 max-w-xs text-xs text-muted-foreground">
                    {t("empty.noMatchesHint")}
                  </p>
                  <Link
                    href={`/${locale}/job-seeker/preferences`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("actions.setPreferences")}
                  </Link>
                </div>
              )}

              {(() => {
                const HIGH_MATCH_THRESHOLD = 60;
                const highMatch = visibleJobs.filter((j) => j.matchScore >= HIGH_MATCH_THRESHOLD);
                const otherJobs = visibleJobs.filter((j) => j.matchScore < HIGH_MATCH_THRESHOLD);
                const renderCard = (job: FeedJob) => (
                  <JobFeedCard
                    key={job._id}
                    job={job}
                    isSaved={savedIds.has(job._id)}
                    isApplied={appliedIds.has(job._id)}
                    onSave={() => saveMutation.mutate(job._id)}
                    onApply={() => handleApply(job)}
                    onHide={() => {
                      setHidden((s) => new Set([...s, job._id]));
                      toast.success(t("toast.jobHidden"));
                    }}
                    locale={locale}
                  />
                );
                return (
                  <>
                    {highMatch.map(renderCard)}
                    {highMatch.length > 0 && otherJobs.length > 0 && (
                      <div className="flex items-center gap-3 py-2">
                        <div className="h-px flex-1 bg-border/60" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                          {t("divider.moreJobs")}
                        </span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    )}
                    {otherJobs.map(renderCard)}
                  </>
                );
              })()}

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
                        {t("pagination.showingPage", { page: poolPage, pages: totalPoolPages, visible: visibleJobs.length, total: totalJobs })}
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
                            {t("pagination.previousPage")}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setPoolPage((p) => p + 1);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                        >
                          {t("pagination.nextPage")}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-center text-sm text-muted-foreground">
                        {t("pagination.seenAll", { count: totalJobs })}
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
                            {t("pagination.backToFirst")}
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

      {applyJob && (
        <EasyApplyFlowDialog
          jobId={applyJob._id}
          jobTitle={applyJob.title}
          companyName={applyJob.employerId?.companyName}
          skills={applyJob.requirements?.skills ?? []}
          matchScore={applyJob.matchScore}
          open={!!applyJob}
          onOpenChange={(o) => !o && setApplyJob(null)}
          onApplied={handleApplied}
        />
      )}

      <SaveSearchDialog
        open={saveSearchOpen}
        onOpenChange={setSaveSearchOpen}
        query={debouncedSearch}
        experienceLevel={prefillExperience}
        workType={prefillWorkType}
        locale={locale}
      />
    </div>
  );
}
