"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Info, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { MatchingRequestError, useJobMatchingCandidates, type MatchingCandidate } from "@/hooks/useJobMatchingCandidates";
import { formatCount } from "@/lib/ui/intlFormat";
import { MatchCandidateCard } from "./MatchCandidateCard";
import { InviteCandidateDialog } from "./InviteCandidateDialog";

interface JobMatchesWorkspaceProps {
  locale: string;
  jobId: string;
}

export function JobMatchesWorkspace({ locale, jobId }: JobMatchesWorkspaceProps) {
  const t = useTranslations("agentJobMatches");
  // The shared list pagination: ?page= and ?limit= in the URL, so refresh,
  // Back and a shared link reopen the same page.
  const { page, limit: pageSize, setPage, setLimit } = usePagination(10);
  const { data, isLoading, isError, error, refetch, isFetching } = useJobMatchingCandidates(jobId, page, pageSize);
  const forbidden = error instanceof MatchingRequestError && error.status === 403;
  const [inviting, setInviting] = useState<MatchingCandidate | null>(null);

  const jobActive = data?.job.status === "active";
  const jobHref = `/${locale}/agent/jobs/${jobId}`;

  return (
    <div className="page-container">
      <WorkspaceHeader
        icon={UserSearch}
        title={t("title")}
        context={data?.job.title ?? " "}
        status={isFetching && !isLoading ? t("refreshing") : undefined}
        actions={
          <Link href={jobHref}>
            <Button variant="outline" className="min-h-11 gap-2 rounded-xl">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t("backToJob")}</span>
            </Button>
          </Link>
        }
      />

      <section aria-labelledby="matches-how" className="flex gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h2 id="matches-how" className="font-semibold text-foreground">{t("howTitle")}</h2>
          <p className="text-muted-foreground">{t("howBody")}</p>
          {data && (
            <p className="text-muted-foreground">
              {t("poolStats", {
                pool: formatCount(data.poolSize),
                shown: formatCount(data.total),
                applied: formatCount(data.alreadyApplied),
              })}{" "}
              {data.alreadyApplied > 0 && (
                <Link href={`/${locale}/agent/candidates?jobId=${jobId}`} className="font-medium text-primary underline-offset-2 hover:underline">
                  {t("viewApplicants")}
                </Link>
              )}
            </p>
          )}
          {data && !jobActive && <p className="font-medium text-foreground">{t("inviteNeedsActive")}</p>}
        </div>
      </section>

      {isLoading ? (
        <ListSkeleton count={4} itemClassName="h-44" />
      ) : forbidden ? (
        <EmptyState icon={UserSearch} title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
      ) : isError ? (
        <ErrorState title={t("errorTitle")} description={t("errorDescription")} onRetry={() => refetch()} retryLabel={t("retry")} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Link href={jobHref}>
              <Button variant="outline" className="min-h-11 rounded-xl">{t("backToJob")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3" aria-label={t("listLabel")}>
            {data.data.map((candidate, i) => (
              <li key={candidate.jobSeekerId}>
                <MatchCandidateCard
                  candidate={candidate}
                  rank={(page - 1) * pageSize + i + 1}
                  canInvite={jobActive}
                  onInvite={() => setInviting(candidate)}
                />
              </li>
            ))}
          </ul>
          <PaginationControls
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={pageSize}
            shown={data.data.length}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </>
      )}

      <InviteCandidateDialog jobId={jobId} jobTitle={data?.job.title ?? ""} candidate={inviting} onClose={() => setInviting(null)} />
    </div>
  );
}
