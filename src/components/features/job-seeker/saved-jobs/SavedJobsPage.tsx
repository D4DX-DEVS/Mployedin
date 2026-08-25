"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Bookmark, Loader2, MapPin, DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { formatLocalizedLocation } from "@/lib/i18n/locations";
import { Button } from "@/components/ui/button";

interface SavedJob {
  _id: string;
  jobId: {
    _id: string;
    title: string;
    location?: { city?: string; country?: string; isRemote?: boolean };
    salary?: { min?: number; max?: number; currency?: string };
  };
  savedAt: string;
}

interface SavedJobsResponse {
  items: SavedJob[];
  total: number;
  page: number;
  totalPages: number;
}

function formatSalary(
  salary: SavedJob["jobId"]["salary"],
  numberLocale: string
): string | null {
  if (!salary?.min || !salary?.max || !salary.currency) return null;
  return `${salary.min.toLocaleString(numberLocale)}-${salary.max.toLocaleString(numberLocale)} ${salary.currency}`;
}

function formatDate(
  iso: string,
  locale: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return t("savedToday");
  if (diffDays === 1) return t("savedYesterday");
  if (diffDays < 7) return t("savedDaysAgo", { days: diffDays });

  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  return date.toLocaleDateString(numberLocale);
}

export function SavedJobsPage({ locale }: { locale: string }) {
  const t = useTranslations("jobSeekerSavedJobs");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";

  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["saved-jobs", page],
    queryFn: async (): Promise<SavedJobsResponse> => {
      const res = await fetch(`/api/saved-jobs?page=${page}&limit=10`);
      if (!res.ok) throw new Error("Failed to load saved jobs");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const unsaveMutation = useMutation({
    mutationFn: async (savedJobId: string) => {
      const res = await csrfFetch(`/api/saved-jobs/${savedJobId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unsave job");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate and refetch the saved jobs list
      queryClient.invalidateQueries({ queryKey: ["saved-jobs"] });
      toast.success(t("unsavedSuccess"));
    },
    onError: () => {
      toast.error(t("unsaveFailed"));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-3xl bg-muted/60"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl sm:rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-12 sm:px-6 text-center">
        <Bookmark className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
        <div className="text-lg font-semibold">{t("errorTitle")}</div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("errorMessage")}
        </p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const hasItems = items.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { count: data?.total ?? 0 })}
        </p>
      </div>

      {!hasItems ? (
        <div className="rounded-xl sm:rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-12 sm:px-6 text-center">
          <Bookmark className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <div className="text-lg font-semibold">{t("emptyTitle")}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("emptyMessage")}
          </p>
          <Button asChild className="mt-5 rounded-full px-5">
            <Link href={`/${locale}/job-seeker/jobs`}>
              {t("browseCta")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((savedJob) => {
            const job = savedJob.jobId;
            const locationLabel = formatLocalizedLocation(job.location, locale, {
              remoteLabel: tc("remote"),
              fallback: tc("locationFlexible"),
            });
            const salaryLabel = formatSalary(job.salary, numberLocale);
            const dateLabel = formatDate(savedJob.savedAt, locale, t);

            return (
              <div
                key={savedJob._id}
                className="group flex flex-col gap-3 sm:gap-4 rounded-lg sm:rounded-3xl border border-border/60 bg-background px-3 py-3 sm:px-4 sm:py-4 transition-all hover:border-primary/25 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${locale}/job-seeker/jobs/${job._id}`}
                      className="block text-base font-semibold text-foreground transition-colors hover:text-primary sm:text-lg"
                    >
                      {job.title}
                    </Link>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:gap-x-4 sm:text-sm">
                      {locationLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {locationLabel}
                        </span>
                      )}
                      {salaryLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" />
                          {salaryLabel}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
                      {t("saved")}{" "}
                      <span className="font-medium">{dateLabel}</span>
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={unsaveMutation.isPending}
                    onClick={() => unsaveMutation.mutate(savedJob._id)}
                    className="h-9 shrink-0 rounded-full px-3 sm:px-4"
                    aria-label={t("unsave")}
                  >
                    {unsaveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline ms-1">
                          {t("unsave")}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full"
              >
                {tc("back")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {tc("page")} {page} {tc("of")} {data.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full"
              >
                {tc("next")}
              </Button>
            </div>
          )}

          {/* No more items message */}
          {data && data.totalPages === page && items.length > 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              {t("endOfList")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
