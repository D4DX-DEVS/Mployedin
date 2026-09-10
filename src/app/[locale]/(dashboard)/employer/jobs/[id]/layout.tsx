"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft, Edit2, MoreHorizontal, Send, PauseCircle, PlayCircle, Copy,
  Settings2, XCircle, Trash2, MapPin, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProfileDetailSkeleton } from "@/components/ui/loading";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/shared/WorkspaceTabs";
import SocialShare from "@/components/features/public/SocialShare";
import { JOB_STATUS_BADGE_CLASS, jobStatusLabelKey } from "@/components/features/employer/jobs/jobStatus";
import { usePermissions } from "@/hooks/usePermissions";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useJobDetail, useUpdateJobStatus, useCloneJob, useDeleteJob, type Job,
} from "@/hooks/useJobs";
import { useJobHiringSummary } from "@/hooks/useJobHiringSummary";
import { stagesFrom } from "@/lib/hiring/pipeline";
import { toUserFacingError } from "@/lib/errors/user-facing";

/* Routes under /jobs/[id] that keep their own full-page UI. */
const PASS_THROUGH = ["/edit", "/poster"];

function formatLocation(job: Job, remoteSuffix: string): string {
  if (typeof job.location === "string") return job.location;
  if (!job.location) return "";
  const { city, country, isRemote } = job.location;
  const base = [city, country].filter(Boolean).join(", ");
  return `${base}${isRemote ? remoteSuffix : ""}`.trim();
}

/**
 * Job Workspace shell: one header (title · status · funnel · actions) over
 * URL-addressable tabs. Every tab page renders inside `children`.
 * Mobile-first: no breadcrumb below `sm`, six-metric funnel replaced by a
 * one-line summary, Setup tab folded into the More menu below `sm` (A3).
 * The menu never repeats a tab or a header button (A23): from `sm` Setup is a
 * tab, and "Save as template" lives on Posting → Reuse.
 */
export default function JobWorkspaceLayout({ children }: { children: ReactNode }) {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("employerJobWorkspace");
  const tj = useTranslations("employerJobs");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const { data: job, isLoading, isError, refetch } = useJobDetail(id);
  const summaryQuery = useJobHiringSummary(id);
  const summary = summaryQuery.data;

  const updateStatus = useUpdateJobStatus();
  const cloneJob = useCloneJob();
  const deleteJob = useDeleteJob();
  const [busy, setBusy] = useState<"publish" | "pause" | "resume" | "close" | "delete" | "clone" | null>(null);

  const jobHref = `/${locale}/employer/jobs/${id}`;
  const subPath = pathname.slice(pathname.indexOf(`/jobs/${id}`) + `/jobs/${id}`.length);
  if (PASS_THROUGH.some((p) => subPath.startsWith(p))) {
    return <>{children}</>;
  }

  async function setStatus(status: "active" | "paused" | "closed", action: "publish" | "pause" | "resume" | "close") {
    if (action === "publish") {
      const ok = await confirmDialog(t("confirmPublish"));
      if (!ok) return;
    }
    if (action === "close") {
      const ok = await confirmDialog({ message: t("confirmCloseJob"), variant: "destructive" });
      if (!ok) return;
    }
    setBusy(action);
    try {
      await updateStatus.mutateAsync({ jobId: id, status });
      await Promise.all([refetch(), summaryQuery.refetch()]);
      toast.success(t("statusUpdated"));
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("statusUpdateError") }).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleClone() {
    if (!job) return;
    // Duplicating creates data; say what travels and that it lands as a draft.
    const ok = await confirmDialog({
      title: t("clone"),
      message: t("confirmDuplicate", { title: job.title }),
      confirmLabel: t("duplicateConfirmLabel"),
      variant: "default",
    });
    if (!ok) return;
    setBusy("clone");
    try {
      const data = await cloneJob.mutateAsync(id);
      const newId = data?.job?._id as string | undefined;
      if (!newId) throw new Error(t("cloneError"));
      router.push(`/${locale}/employer/jobs/${newId}/edit`);
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("cloneError") }).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteDraft() {
    const ok = await confirmDialog({ message: t("confirmDeleteDraft"), variant: "destructive" });
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteJob.mutateAsync(id);
      router.push(`/${locale}/employer/jobs`);
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("deleteError") }).message);
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="page-container animate-in fade-in duration-300">
        <ProfileDetailSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-container">
        <div className="card-base p-8 py-20 text-center">
          <h1 className="heading-section mb-3 font-semibold">{t("loadError")}</h1>
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => refetch()}>{t("retry")}</Button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-container">
        <div className="card-base p-8 py-20 text-center">
          <h1 className="heading-section mb-2 font-semibold">{t("notFound")}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{t("notFoundDesc")}</p>
          <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
            <Link href={`/${locale}/employer/jobs`}><ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {t("backToJobs")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const canUpdate = can("jobs", "update");
  const canCreate = can("jobs", "create");
  const canDelete = can("jobs", "delete");
  const location = formatLocation(job, t("remoteSuffix"));
  const context = [location, job.category].filter(Boolean).join(" · ");
  const statusLabel = tj(jobStatusLabelKey(job.status));
  const counts = summary?.statusCounts;
  const shortlistedReached = counts
    ? stagesFrom("shortlisted").reduce((n, stage) => n + (counts[stage] ?? 0), 0)
    : undefined;

  const countOrNone = (n: number | undefined) => (n && n > 0 ? n : undefined);
  const tabs: WorkspaceTab[] = [
    { key: "overview", label: t("tabOverview"), href: jobHref, exact: true },
    { key: "applications", label: t("tabApplications"), href: `${jobHref}/applications`, count: countOrNone(summary?.total) },
    // The tabs run in pipeline order, so Shortlist sits between Applications and
    // Interviews. Its count is everyone who has reached the shortlist, not only
    // those parked there — moving on does not unpick a candidate.
    { key: "shortlist", label: t("tabShortlist"), href: `${jobHref}/shortlist`, count: countOrNone(shortlistedReached) },
    { key: "interviews", label: t("tabInterviews"), href: `${jobHref}/interviews`, count: countOrNone(summary?.interviews.open) },
    { key: "offers", label: t("tabOffers"), href: `${jobHref}/offers`, count: countOrNone(summary?.offers.pending) },
    { key: "hires", label: t("tabHires"), href: `${jobHref}/hires`, count: countOrNone(counts?.hired) },
    // A supporting process, not a pipeline stage — employers run checks before
    // an offer, after a conditional one, or never — so it sits after the funnel
    // tabs alongside Posting and Setup rather than between Interviews and
    // Offers. Count is the checks still open.
    { key: "background-checks", label: t("tabChecks"), href: `${jobHref}/background-checks`, count: countOrNone(summary?.checks.inProgress) },
    { key: "posting", label: t("tabPosting"), href: `${jobHref}/posting` },
    { key: "setup", label: t("tabSetup"), href: `${jobHref}/setup`, hideOnPhone: true },
  ];

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/${locale}/jobs/${id}` : "";

  const statusAction = canUpdate ? (
    job.status === "draft" ? (
      <Button className="min-h-11 gap-1.5 rounded-xl sm:min-h-10" onClick={() => { void setStatus("active", "publish"); }} disabled={busy === "publish"}>
        <Send className="h-4 w-4" aria-hidden /> {busy === "publish" ? t("publishing") : t("publish")}
      </Button>
    ) : job.status === "active" ? (
      <Button variant="outline" className="min-h-11 gap-1.5 rounded-xl sm:min-h-10" onClick={() => { void setStatus("paused", "pause"); }} disabled={busy === "pause"}>
        <PauseCircle className="h-4 w-4" aria-hidden /> {t("pause")}
      </Button>
    ) : job.status === "paused" ? (
      <Button className="min-h-11 gap-1.5 rounded-xl sm:min-h-10" onClick={() => { void setStatus("active", "resume"); }} disabled={busy === "resume"}>
        <PlayCircle className="h-4 w-4" aria-hidden /> {t("resume")}
      </Button>
    ) : null
  ) : null;

  const actions = (
    <>
      {/* Status rides with the actions so it centres on the same line as the buttons. */}
      <span className={`${JOB_STATUS_BADGE_CLASS[job.status] ?? ""} inline-flex items-center self-center rounded-full border px-2.5 py-1 text-[11px] font-semibold`} aria-live="polite">
        {statusLabel}
      </span>
      {canUpdate && (
        <Button asChild variant="outline" className="h-11 w-11 rounded-xl p-0 sm:h-10 sm:w-auto sm:px-3">
          <Link href={`${jobHref}/edit`} aria-label={t("edit")}>
            <Edit2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("edit")}</span>
          </Link>
        </Button>
      )}
      {job.status === "active" && publicUrl && (
        <div className="[&>div>button]:min-h-11 [&>div>button]:rounded-xl sm:[&>div>button]:min-h-10">
          <SocialShare url={publicUrl} title={job.title} description={job.description?.slice(0, 120)} />
        </div>
      )}
      {statusAction}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            aria-label={t("moreActions")}
            className="h-11 w-11 shrink-0 rounded-xl p-0 text-muted-foreground hover:text-foreground sm:h-10 sm:w-10"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canCreate && (
            <DropdownMenuItem className="min-h-11 sm:min-h-8" onClick={() => { void handleClone(); }} disabled={busy === "clone"}>
              <Copy className="h-4 w-4" /> {busy === "clone" ? t("cloning") : t("clone")}
            </DropdownMenuItem>
          )}
          {/* Phones only: the Setup tab is hidden below sm (A3), so this is its
              way in there. From sm the tab exists and the menu must not repeat it. */}
          {canUpdate && (
            <DropdownMenuItem className="min-h-11 sm:hidden" onClick={() => router.push(`${jobHref}/setup`)}>
              <Settings2 className="h-4 w-4" /> {t("openSetup")}
            </DropdownMenuItem>
          )}
          {canUpdate && (job.status === "active" || job.status === "paused") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { void setStatus("closed", "close"); }}
                disabled={busy === "close"}
                className="min-h-11 text-destructive focus:text-destructive sm:min-h-8"
              >
                <XCircle className="h-4 w-4" /> {t("closeJob")}
              </DropdownMenuItem>
            </>
          )}
          {canDelete && job.status === "draft" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { void handleDeleteDraft(); }}
                disabled={busy === "delete"}
                className="min-h-11 text-destructive focus:text-destructive sm:min-h-8"
              >
                <Trash2 className="h-4 w-4" /> {t("deleteDraft")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      {/* Desktop only: single back link. Phones use the sidebar / system back. */}
      <Link
        href={`/${locale}/employer/jobs`}
        className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t("backToJobs")}
      </Link>

      <WorkspaceHeader
        className="job-workspace-header"
        title={job.title}
        context={
          context ? (
            <span className="inline-flex items-center gap-1.5">
              {location ? <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {context}
            </span>
          ) : undefined
        }
        actions={actions}
      />

      {job.status === "draft" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800 chip-pad">
          {t("draftHint")}
        </p>
      )}

      <WorkspaceTabs
        tabs={tabs}
        ariaLabel={t("tabsLabel")}
        countLabel={(tab, count) => t("tabWithCount", { tab, count })}
      />

      {children}
    </div>
  );
}
