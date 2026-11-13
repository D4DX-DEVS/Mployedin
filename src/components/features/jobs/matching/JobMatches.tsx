"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, CircleAlert, Info, UserSearch } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  EMPLOYER_INVITE_ENDPOINT,
  MatchingRequestError,
  SUPER_AGENT_INVITE_ENDPOINT,
  useJobMatchingCandidates,
  type MatchingCandidate,
  type MatchingCandidatesPage,
} from "@/hooks/useJobMatchingCandidates";
import { formatCount } from "@/lib/ui/intlFormat";
import { MatchCandidateCard } from "./MatchCandidateCard";
import { InviteCandidateDialog } from "./InviteCandidateDialog";

/** Who is looking: decides the wording, the invite route and the profile action. */
export type MatchingRole = "agent" | "employer" | "super_agent" | "admin";

interface JobMatchesProps {
  jobId: string;
  role: MatchingRole;
  /** Link to the job's applicants, shown when some candidates already applied. */
  applicantsHref?: string;
  /** The empty state's way out (e.g. back to the job). */
  emptyAction?: ReactNode;
  /** Super agents: open a candidate's full profile. */
  onViewProfile?: (candidate: MatchingCandidate) => void;
  /** Rendered above the list once the job is known — a standalone page's header. */
  header?: (data: MatchingCandidatesPage | undefined, refreshing: boolean) => ReactNode;
}

/**
 * The database's discoverable candidates ranked for one job, with the reasons
 * behind each score and an invite to apply — the same list for the agent's
 * matches page, the employer's "Suitable profiles" tab, the super agent's and
 * the admin's matches pages. Who may see it, and invite from it, is decided on
 * the server.
 */
export function JobMatches({ jobId, role, applicantsHref, emptyAction, onViewProfile, header }: JobMatchesProps) {
  const t = useTranslations("agentJobMatches");
  // The shared list pagination: ?page= and ?limit= in the URL, so refresh,
  // Back and a shared link reopen the same page.
  const { page, limit: pageSize, setPage, setLimit } = usePagination(10);
  const { data, isLoading, isError, error, refetch, isFetching } = useJobMatchingCandidates(jobId, page, pageSize);
  const forbidden = error instanceof MatchingRequestError && error.status === 403;
  const [inviting, setInviting] = useState<MatchingCandidate | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const jobActive = data?.job.status === "active";

  // Literal keys only — a template-literal key escapes the missing-key checks.
  const copy =
    role === "employer"
      ? { how: t("employer.howBody"), forbiddenTitle: t("employer.forbiddenTitle"), forbiddenDescription: t("employer.forbiddenDescription") }
      : role === "super_agent"
        ? { how: t("howBody"), forbiddenTitle: t("superAgent.forbiddenTitle"), forbiddenDescription: t("superAgent.forbiddenDescription") }
        : role === "admin"
          ? { how: t("howBody"), forbiddenTitle: t("admin.forbiddenTitle"), forbiddenDescription: t("admin.forbiddenDescription") }
          : { how: t("howBody"), forbiddenTitle: t("forbiddenTitle"), forbiddenDescription: t("forbiddenDescription") };

  return (
    <div className="space-y-4 lg:space-y-6">
      {header?.(data, isFetching && !isLoading)}

      {/* The numbers stay in view; the explanation folds behind its heading.
          Open by default it was a 280px box above the list on a phone. */}
      <section aria-labelledby={`matches-how-${jobId}`} className="flex gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          {data && (
            <p className="text-foreground">
              {t("poolStats", {
                pool: formatCount(data.poolSize),
                shown: formatCount(data.total),
                applied: formatCount(data.alreadyApplied),
              })}{" "}
              {data.alreadyApplied > 0 && applicantsHref && (
                <Link href={applicantsHref} className="font-medium text-primary underline-offset-2 hover:underline">
                  {t("viewApplicants")}
                </Link>
              )}
            </p>
          )}
          <h2 id={`matches-how-${jobId}`}>
            <button
              type="button"
              onClick={() => setHowOpen((open) => !open)}
              aria-expanded={howOpen}
              aria-controls={`matches-how-body-${jobId}`}
              className="tap-target-row inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("howTitle")}
              <ChevronDown className={`size-4 transition-transform ${howOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
          </h2>
          <p id={`matches-how-body-${jobId}`} hidden={!howOpen} className="text-muted-foreground">{copy.how}</p>
        </div>
      </section>

      {/* Said once here. Each card used to carry a greyed Invite button
          instead: ten buttons on a page that could not be pressed. */}
      {data && !jobActive && data.data.length > 0 && (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("inviteNeedsActive")}
        </p>
      )}

      {isLoading ? (
        <ListSkeleton count={4} itemClassName="h-44" />
      ) : forbidden ? (
        <EmptyState icon={UserSearch} title={copy.forbiddenTitle} description={copy.forbiddenDescription} />
      ) : isError ? (
        <ErrorState title={t("errorTitle")} description={t("errorDescription")} onRetry={() => refetch()} retryLabel={t("retry")} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title={t("emptyTitle")}
          description={data?.job.listsSkills === false ? t("emptyNoSkills") : t("emptyDescription")}
          action={emptyAction}
        />
      ) : (
        <>
          {/* One card per row left most of an 820px or 1440px row empty. */}
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={t("listLabel")}>
            {data.data.map((candidate, i) => (
              <li key={candidate.jobSeekerId} className="min-w-0">
                <MatchCandidateCard
                  candidate={candidate}
                  // From the page the data came from: while the next page
                  // loads, the previous one stays on screen with its own ranks.
                  rank={(data.page - 1) * data.pageSize + i + 1}
                  canInvite={jobActive}
                  onInvite={() => setInviting(candidate)}
                  onViewProfile={onViewProfile ? () => onViewProfile(candidate) : undefined}
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

      <InviteCandidateDialog
        jobId={jobId}
        jobTitle={data?.job.title ?? ""}
        candidate={inviting}
        onClose={() => setInviting(null)}
        role={role}
        endpoint={role === "super_agent" ? SUPER_AGENT_INVITE_ENDPOINT : EMPLOYER_INVITE_ENDPOINT}
      />
    </div>
  );
}
