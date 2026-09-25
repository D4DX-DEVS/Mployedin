"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Inbox, Loader2, Search, Star, X } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHero } from "@/components/shared/PageHero";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatDate } from "@/lib/ui/intlFormat";

type ReviewStatus = "pending" | "approved" | "rejected";

interface ReviewRow {
  _id: string;
  employerId?: { _id: string; companyName?: string } | null;
  userId?: { _id: string; name?: string; email?: string } | null;
  rating: number;
  title: string;
  pros: string;
  cons: string;
  jobTitle?: string;
  employmentStatus?: "current" | "former";
  recommendToFriend?: boolean;
  isAnonymous?: boolean;
  status: ReviewStatus;
  createdAt: string;
}

const STATUS_FILTERS = ["pending", "approved", "rejected", "all"] as const;

const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-slate-200 text-slate-800",
};

/**
 * Company review moderation. Job seekers submit reviews as pending and the
 * public company page shows only approved ones — before this page nothing
 * could approve a review, so none was ever published.
 */
export default function AdminCompanyReviewsPage() {
  const t = useTranslations("adminCompanyReviews");
  const locale = useLocale();
  const [status, setStatus] = useUrlFilter("status", "pending", { allow: STATUS_FILTERS });
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t("title")} · MPLOYEDIN`;
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/company-reviews?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(data.items ?? []);
      updateTotal(data.pagination?.total ?? 0);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, search, updateTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (review: ReviewRow, next: "approved" | "rejected") => {
    const company = review.employerId?.companyName ?? t("unknownCompany");
    const ok = await confirm(
      next === "approved"
        ? { title: t("approveTitle"), message: t("approveMessage", { company }), confirmLabel: t("approve") }
        : {
            title: review.status === "approved" ? t("unpublishTitle") : t("rejectTitle"),
            message: t("rejectMessage", { company }),
            confirmLabel: review.status === "approved" ? t("unpublish") : t("reject"),
            variant: "destructive",
          },
    );
    if (!ok) return;
    setBusyId(review._id);
    try {
      const res = await fetch(`/api/admin/company-reviews/${review._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(next === "approved" ? t("approvedToast") : t("rejectedToast"));
      await load();
    } catch {
      toast.error(t("moderateError"));
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = (value: string) => {
    setStatus(value);
    resetPage();
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHero compact compactOnMobile title={t("title")} description={t("description")} />

      <section className="workspace-panel-surface rounded-2xl panel-body" aria-labelledby="company-reviews-list">
        <h2 id="company-reviews-list" className="sr-only">
          {t("listLabel")}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1" role="group" aria-label={t("statusFilterLabel")}>
            <div className="flex w-max gap-1.5">
              {STATUS_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => changeStatus(value)}
                  className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    status === value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`filters.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Label htmlFor="company-reviews-search" className="sr-only">
              {t("searchLabel")}
            </Label>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="company-reviews-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder={t("searchPlaceholder")}
              className="h-10 ps-9"
            />
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <ul className="flex flex-col gap-3" aria-busy="true" aria-label={t("loading")}>
              {Array.from({ length: 3 }, (_, index) => (
                <li key={index} className="workspace-subtle-surface rounded-xl p-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-3 h-4 w-2/3" />
                  <Skeleton className="mt-2 h-12 w-full" />
                </li>
              ))}
            </ul>
          ) : failed ? (
            <ErrorState title={t("loadErrorTitle")} description={t("loadError")} onRetry={() => void load()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={search ? t("emptySearchTitle") : t(`empty.${status}`)}
              description={search ? t("emptySearchDescription") : undefined}
              action={
                search ? (
                  <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                    {t("clearSearch")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((review) => {
                const busy = busyId === review._id;
                const author = review.userId?.name ?? t("unknownAuthor");
                return (
                  <li key={review._id} className="workspace-subtle-surface rounded-xl p-4" data-review-status={review.status}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {review.employerId?._id ? (
                        <Link
                          href={`/${locale}/companies/${review.employerId._id}`}
                          className="text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {review.employerId.companyName ?? t("unknownCompany")}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{t("unknownCompany")}</span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800" aria-label={t("ratingAria", { rating: review.rating })}>
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
                        {review.rating}/5
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[review.status]}`}>{t(`status.${review.status}`)}</span>
                      <span className="ms-auto text-xs text-muted-foreground">{formatDate(new Date(review.createdAt), undefined, locale)}</span>
                    </div>

                    <h3 className="mt-2 text-sm font-semibold text-foreground">{review.title}</h3>
                    <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold text-emerald-800">{t("pros")}</dt>
                        <dd className="mt-0.5 line-clamp-4 whitespace-pre-line text-muted-foreground">{review.pros}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-rose-800">{t("cons")}</dt>
                        <dd className="mt-0.5 line-clamp-4 whitespace-pre-line text-muted-foreground">{review.cons}</dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("byline", { author, email: review.userId?.email ?? "—" })}
                        {review.jobTitle ? ` · ${review.jobTitle}` : ""}
                        {review.employmentStatus ? ` · ${t(`employment.${review.employmentStatus}`)}` : ""}
                        {review.isAnonymous ? ` · ${t("anonymous")}` : ""}
                      </p>
                      <div className="flex gap-2">
                        {review.status !== "rejected" && (
                          <Button variant="outline" size="sm" className="min-h-9 gap-1.5" disabled={busy} onClick={() => void moderate(review, "rejected")}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                            {review.status === "approved" ? t("unpublish") : t("reject")}
                          </Button>
                        )}
                        {review.status !== "approved" && (
                          <Button size="sm" className="min-h-9 gap-1.5" disabled={busy} onClick={() => void moderate(review, "approved")}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                            {t("approve")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!loading && !failed && total > 0 && (
          <PaginationControls
            className="mt-4"
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </section>
    </div>
  );
}
