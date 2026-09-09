"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useJobHires, type HireRow } from "@/hooks/useJobHires";

interface HiresListProps {
  jobId: string;
  locale: string;
}

const PLACEMENT_KEY: Record<string, string> = { active: "placementActive", completed: "placementCompleted", terminated: "placementTerminated" };
const CHECK_KEY: Record<string, string> = { pending: "checkPending", in_progress: "checkInProgress", completed: "checkCompleted", cancelled: "checkCancelled" };
const VISA_KEY: Record<string, string> = { not_required: "visaNotRequired", pending: "visaPending", approved: "visaApproved", rejected: "visaRejected", stamped: "visaStamped" };

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name?: string): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "•";
}

/**
 * Hires tab: one row per hired candidate on the job — placement, visa,
 * background check, onboarding. Employers cannot create placements
 * (permission matrix); a hire without one reads "Placement pending".
 */
export function HiresList({ jobId, locale }: HiresListProps) {
  const t = useTranslations("employerJobWorkspace");
  const { rows, isLoading, isError, refetch } = useJobHires(jobId);
  const dateLocale = locale === "ar" ? "ar" : "en-US";
  const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" }) : null);
  const label = (map: Record<string, string>, value?: string) => (value ? (map[value] ? t(map[value]) : humanize(value)) : "");

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/50" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card-base p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">{t("loadError")}</p>
        <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => { void refetch(); }}>{t("retry")}</Button>
      </div>
    );
  }

  if (rows.length === 0) {
    // EmptyState brings its own dashed frame; no outer card (matches Offers).
    return <EmptyState icon={UserCheck} title={t("hiresEmptyTitle")} description={t("hiresEmptyHint")} />;
  }

  const footer = (
    <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
      <Link href={`/${locale}/employer/placements`} className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-2 hover:underline sm:min-h-9">
        {t("hiresViewAllPlacements")} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
      </Link>
      <span className="text-border">·</span>
      <Link href={`/${locale}/employer/background-checks?jobId=${jobId}`} className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-2 hover:underline sm:min-h-9">
        {t("hiresViewAllChecks")} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  );

  return (
    <div className="space-y-3">
      <ul role="list" className="space-y-2">
        {rows.map((row: HireRow) => {
          const name = row.candidateName ?? t("hiresCandidate");
          const start = fmt(row.placement?.startDate);
          return (
            <li key={row.applicationId} className="workspace-panel-surface card-pad grid gap-3 rounded-2xl sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              {/* Candidate */}
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  {row.avatar ? <AvatarImage src={row.avatar} alt="" /> : null}
                  <AvatarFallback>{initials(row.candidateName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusBadge status="hired" />
                    {row.hiredAt ? <span>{fmt(row.hiredAt)}</span> : null}
                  </div>
                </div>
              </div>

              {/* Placement */}
              <div className="min-w-0 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("hiresPlacement")}</p>
                {row.placement ? (
                  <>
                    <p className="font-medium text-foreground">{label(PLACEMENT_KEY, row.placement.status)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[start ? t("hiresStart", { date: start }) : null, label(VISA_KEY, row.placement.visaStatus) || null].filter(Boolean).join(" · ")}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("hiresPlacementPending")}</p>
                )}
              </div>

              {/* Background check */}
              <div className="min-w-0 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("hiresCheck")}</p>
                {row.check ? (
                  <>
                    <p className="inline-flex items-center gap-1 font-medium text-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-status-selected" aria-hidden /> {label(CHECK_KEY, row.check.status)}
                    </p>
                    {row.check.referencesTotal > 0 ? (
                      <p className="text-xs text-muted-foreground">{t("hiresReferences", { done: row.check.referencesReplied, total: row.check.referencesTotal })}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("hiresNoCheck")}{" "}
                    <Link href={`/${locale}/employer/background-checks?jobId=${jobId}`} className="inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline sm:min-h-0">
                      {t("hiresRequestCheck")}
                    </Link>
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 sm:justify-end">
                {row.placement ? (
                  <Button asChild variant="outline" className="min-h-11 flex-1 rounded-xl sm:min-h-9 sm:flex-none">
                    <Link href={`/${locale}/employer/placements/${row.placement._id}/onboarding`}>{t("hiresOpenOnboarding")}</Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}
