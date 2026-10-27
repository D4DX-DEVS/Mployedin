"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { JobSummaryCard } from "@/components/features/job-seeker/JobSummaryCard";
import { SaveJobButton } from "@/components/features/job-seeker/saved/SaveJobButton";
import { SAVED_JOBS_LIST_KEY } from "@/components/features/job-seeker/saved/useSavedJobs";

interface SavedJobRow {
  savedAt: string;
  job: {
    _id: string;
    title: string;
    status?: string;
    createdAt?: string;
    employmentType?: string;
    location?: { city?: string; country?: string; isRemote?: boolean };
    salary?: { min?: number; max?: number; currency?: string };
    requirements?: { skills?: string[] };
    employerId?: { _id: string; companyName?: string; logo?: string };
  };
}

interface SavedJobsResponse {
  items: SavedJobRow[];
  total: number;
  totalPages: number;
}

/** The jobs a seeker bookmarked from Jobs, Home or a job page, newest first. */
export default function SavedJobsPage() {
  const t = useTranslations("savedJobs");
  const locale = useLocale();
  const pagination = usePagination();
  const { page, limit, setPage, updateTotal } = pagination;

  const { data, isPending, isError, refetch } = useQuery<SavedJobsResponse>({
    queryKey: [...SAVED_JOBS_LIST_KEY, page, limit],
    queryFn: async () => {
      const res = await fetch(`/api/saved-jobs?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error(`saved-jobs ${res.status}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (!data) return;
    updateTotal(data.total);
    // Unsaving the last job on a later page leaves it empty: step back one.
    if (data.items.length === 0 && page > 1) setPage(page - 1);
  }, [data, page, setPage, updateTotal]);

  const items = data?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={data ? t("count", { count: data.total }) : t("description")}
      />

      <section className="workspace-panel-surface rounded-3xl panel-body">
        {isPending ? (
          <ListSkeleton count={4} itemClassName="h-32" />
        ) : isError ? (
          <ErrorState title={t("title")} onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button asChild>
                <Link href={`/${locale}/job-seeker/jobs`}>{t("browseJobs")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map(({ job }) => {
              const open = job.status === "active";
              return (
                <JobSummaryCard
                  key={job._id}
                  locale={locale}
                  showMatchScore={false}
                  job={{
                    _id: job._id,
                    title: job.title,
                    createdAt: job.createdAt,
                    employmentType: job.employmentType,
                    location: job.location,
                    salary: job.salary,
                    skills: job.requirements?.skills ?? [],
                    company: job.employerId
                      ? { _id: job.employerId._id, name: job.employerId.companyName, logo: job.employerId.logo }
                      : null,
                  }}
                  statusSlot={
                    open ? null : (
                      <Badge variant="secondary" className="py-0 text-[11px]">{t("closed")}</Badge>
                    )
                  }
                  actions={
                    <>
                      <SaveJobButton jobId={job._id} />
                      <Button asChild size="sm" className="min-h-11 rounded-xl px-4">
                        <Link href={`/${locale}/job-seeker/jobs/${job._id}`}>
                          {t("viewJob")}
                          <ArrowRight className="ms-1.5 size-4 rtl:rotate-180" aria-hidden="true" />
                        </Link>
                      </Button>
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {pagination.total > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      )}
    </div>
  );
}
