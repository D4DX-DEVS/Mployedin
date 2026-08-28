"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import {
  Sparkles,
  MapPin,
  DollarSign,
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  ArrowUpDown,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ApplyWithCvDialog } from "@/components/features/job-seeker/feed/ApplyWithCvDialog";
import { formatCount } from "@/lib/ui/intlFormat";

interface JobPage {
  jobs: RecommendedJob[];
  nextCursor: string | null;
  total: number;
}

interface RecommendedJob {
  _id: string;
  title: string;
  salary: { min: number; max: number; currency: string };
  location: { country: string; city: string; isRemote: boolean };
  employerId: { _id: string; companyName: string; logo?: string } | null;
  matchScore: number;
  createdAt: string;
  tags?: string[];
}

type SortMode = "match" | "latest" | "salary";

function JobCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border card-pad">
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="h-3 w-40 rounded bg-muted" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-8 w-8 rounded bg-muted" />
          <div className="h-8 w-16 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

const SORT_LABELS: Record<SortMode, string> = {
  match: "Best Match",
  latest: "Latest",
  salary: "Salary",
};

async function fetchJobs(cursor: string | null, sort: SortMode): Promise<JobPage> {
  const params = new URLSearchParams({ limit: "10", sort });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/jobs/recommended?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export function RecommendedJobs({ locale }: { locale: string }) {
  const t = useTranslations("recommendedJobs");
  const qc = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["recommended-jobs", sortMode],
    queryFn: ({ pageParam }) => fetchJobs(pageParam as string | null, sortMode),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Infinite scroll via IntersectionObserver
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
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  const { allowed: applyAllowed } = useFeatureGate("applicationsSubmitted");
  const [cvApplyJob, setCvApplyJob] = useState<RecommendedJob | null>(null);

  const applyMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetch(`/api/jobs/${jobId}/apply`, { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((d: { error?: string }) => Promise.reject(d.error ?? "Failed"));
        return r.json();
      }),
    onMutate: (jobId) => setAppliedIds((s) => new Set([...s, jobId])),
    onSuccess: () => {
      toast.success(t("applicationSubmitted"));
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recommended-jobs"] });
    },
    onError: (err: unknown, jobId) => {
      setAppliedIds((s) => { const n = new Set(s); n.delete(jobId); return n; });
      toast.error(typeof err === "string" ? err : t("failedToApply"));
    },
  });

  const saveMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetch(`/api/jobs/${jobId}/save`, { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((d: { error?: string }) => Promise.reject(d.error ?? "Failed to save job"));
        return r.json();
      }),
    onMutate: (jobId) => {
      setSavedIds((s) => {
        const n = new Set(s);
        if (n.has(jobId)) { n.delete(jobId); } else { n.add(jobId); }
        return n;
      });
    },
    onSuccess: (data: { saved: boolean }, jobId) => {
      toast.success(data.saved ? t("jobSaved") : t("jobUnsaved"));
      if (data.saved) {
        setSavedIds((s) => new Set([...s, jobId]));
      } else {
        setSavedIds((s) => { const n = new Set(s); n.delete(jobId); return n; });
      }
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: unknown, jobId) => {
      setSavedIds((s) => { const n = new Set(s); n.has(jobId) ? n.delete(jobId) : n.add(jobId); return n; });
      toast.error(typeof err === "string" ? err : t("failedToUpdateSaved"));
    },
  });

  const allJobs = data?.pages.flatMap((p) => p.jobs) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  if (isLoading) {
    return (
      <div className="card-base panel-body">
        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <div className="h-4 w-36 rounded bg-muted animate-pulse" />
          <div className="h-8 w-28 rounded bg-muted animate-pulse" />
        </div>
        <div className="space-y-2 sm:space-y-3">
          <JobCardSkeleton />
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-base text-center panel-body">
        <p className="text-sm text-muted-foreground">{t("failedToLoad")}</p>
      </div>
    );
  }

  if (allJobs.length === 0) {
    return (
      <div className="card-base text-center panel-body">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm font-medium text-muted-foreground">{t("noMatches")}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {t("expandPreferences")}
        </p>
        <div className="flex justify-center gap-2">
          <Link href={`/${locale}/job-seeker/preferences`}>
            <Button size="sm">{t("setPreferences")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card-base panel-body">
      <div className="mb-3 sm:mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="heading-label font-semibold">
            Recommended for You
            {total > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({total})
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-3 w-3 text-muted-foreground mr-1" />
          {(["match", "latest", "salary"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                sortMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SORT_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {allJobs.map((job) => {
          const isApplied = appliedIds.has(job._id);
          const isSaved = savedIds.has(job._id);

          return (
            <div
              key={job._id}
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 rounded-lg border border-border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:bg-accent/30 card-pad"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {job.title}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`shrink-0 text-[11px] px-1.5 py-0 ${
                      job.matchScore >= 70
                        ? "bg-green-100 text-green-700"
                        : job.matchScore >= 50
                        ? "bg-amber-100 text-amber-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {job.matchScore}% match
                  </Badge>
                  {job.location.isRemote && (
                    <Badge variant="outline" className="text-[11px] px-1.5 py-0">{t("remote")}</Badge>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {job.employerId?.companyName ?? "Company"}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {job.location.city}, {job.location.country}
                  </span>
                  {job.salary?.min > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatCount(job.salary.min)}â€“{formatCount(job.salary.max)}{" "}
                      {job.salary.currency}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col sm:w-auto sm:items-end gap-2 sm:gap-1.5">
                <div className="flex w-full gap-1.5 sm:w-auto sm:flex-col">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 sm:w-7 sm:p-0 flex-1 sm:flex-none"
                    onClick={() => saveMutation.mutate(job._id)}
                    disabled={saveMutation.isPending && saveMutation.variables === job._id}
                    title={isSaved ? "Unsave job" : "Save job"}
                  >
                    {isSaved ? (
                      <BookmarkCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="flex flex-1 items-center gap-1 sm:flex-col sm:items-stretch sm:gap-1.5">
                    {!isApplied && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1 sm:flex-none"
                        onClick={() => applyAllowed ? setCvApplyJob(job) : toast.error(t("applicationLimitReached"))}
                        disabled={!applyAllowed}
                        title="Apply with a chosen or updated CV"
                      >
                        <FileText className="mr-1 h-3 w-3" />
                        CV
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1 sm:flex-none"
                      onClick={() => applyAllowed ? applyMutation.mutate(job._id) : toast.error(t("applicationLimitReached"))}
                      disabled={!applyAllowed || isApplied || (applyMutation.isPending && applyMutation.variables === job._id)}
                    >
                      {isApplied ? (
                        <>
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Applied
                        </>
                      ) : (
                        "Apply"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="mt-3 sm:mt-4 h-1" />
      {isFetchingNextPage && (
        <div className="space-y-2 sm:space-y-3 mt-2 sm:mt-3">
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      )}

      {cvApplyJob && (
        <ApplyWithCvDialog
          jobId={cvApplyJob._id}
          jobTitle={cvApplyJob.title}
          open={!!cvApplyJob}
          onOpenChange={(o) => { if (!o) setCvApplyJob(null); }}
          onApplied={(jobId) => {
            setAppliedIds((s) => new Set([...s, jobId]));
            toast.success(t("applicationSubmitted"));
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
            qc.invalidateQueries({ queryKey: ["recommended-jobs"] });
          }}
        />
      )}
    </div>
  );
}
