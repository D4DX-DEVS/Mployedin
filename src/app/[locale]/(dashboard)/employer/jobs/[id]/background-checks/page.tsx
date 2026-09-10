"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/ui/intlFormat";

type CheckStatus = "pending" | "in_progress" | "completed" | "cancelled";
type Outcome = "clear" | "flagged" | "failed" | "pending";

interface JobCheck {
  _id: string;
  checkType: "background" | "reference" | "both";
  status: CheckStatus;
  outcome: Outcome;
  references: { status: string }[];
  createdAt: string;
  applicationId?: { _id: string; status?: string };
  jobSeekerId?: { _id: string; fullName?: string; userId?: { name?: string } };
}

/** Outcome wins once a check is finished — "Completed" alone hides the verdict. */
function resultKey(check: JobCheck): { key: string; tone: string } {
  if (check.status === "cancelled") return { key: "resultCancelled", tone: "border-border bg-muted/40 text-muted-foreground" };
  if (check.status === "completed") {
    if (check.outcome === "clear") return { key: "resultClear", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" };
    if (check.outcome === "flagged") return { key: "resultFlagged", tone: "border-amber-500/40 bg-amber-500/10 text-amber-800" };
    if (check.outcome === "failed") return { key: "resultFailed", tone: "border-destructive/40 bg-destructive/10 text-destructive" };
    return { key: "resultDone", tone: "border-border bg-muted/40 text-muted-foreground" };
  }
  return { key: "resultRunning", tone: "border-sky-500/30 bg-sky-500/10 text-sky-700" };
}

/**
 * Background Checks tab: every check raised for this job.
 *
 * Rows are checks, not candidates. A candidate-shaped table here would be a
 * third copy of the list that Applications and Shortlist already carry, and
 * would go stale against them; this only ever holds records that exist.
 * Requesting one for somebody new hands off to the shared dialog, already
 * scoped to this job.
 */
export default function JobBackgroundChecksPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("employerJobWorkspace");
  const tb = useTranslations("employerBackgroundChecks");
  const [checks, setChecks] = useState<JobCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/employer/background-checks?limit=50&jobId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setChecks((data.items ?? []) as JobCheck[]);
    } catch {
      setChecks([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const newCheckHref = `/${locale}/employer/background-checks?jobId=${id}&new=1`;
  /** Carries the check's own id so Manage opens that record, not a list to hunt through. */
  const manageHref = (checkId: string) =>
    `/${locale}/employer/background-checks?jobId=${id}&checkId=${checkId}`;

  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="heading-section font-semibold text-foreground" tabIndex={-1}>{t("checksHeading")}</h2>
          <p className="text-xs text-muted-foreground">{t("checksHint")}</p>
        </div>
        <Button asChild className="min-h-11 rounded-xl sm:min-h-10">
          <Link href={newCheckHref}>
            <ShieldCheck className="me-2 h-4 w-4" aria-hidden /> {tb("newCheck")}
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full rounded-2xl" />)}
        </div>
      ) : failed ? (
        <div className="workspace-panel-surface rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("checksLoadError")}</p>
          <Button variant="outline" className="mt-4 min-h-11 sm:min-h-10" onClick={() => { void load(); }}>
            {t("retry")}
          </Button>
        </div>
      ) : checks.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("checksEmpty")}
          description={t("checksEmptyDesc")}
          action={<Button asChild className="min-h-11 rounded-xl sm:min-h-10"><Link href={newCheckHref}>{tb("newCheck")}</Link></Button>}
        />
      ) : (
        <div className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-3xl">
          <ul role="list" className="divide-y divide-border/70">
            {checks.map((check) => {
              const name = check.jobSeekerId?.fullName || check.jobSeekerId?.userId?.name || tb("unknownCandidate");
              const responded = check.references.filter((r) => r.status === "responded").length;
              const { key, tone } = resultKey(check);
              return (
                <li key={check._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tb(`type.${check.checkType}`)}
                      {check.references.length > 0
                        ? ` · ${t("checksReferences", { done: responded, total: check.references.length })}`
                        : ""}
                      {` · ${t("checksRequested", { date: formatDate(check.createdAt, { day: "numeric", month: "short" }, locale) })}`}
                    </p>
                  </div>
                  {check.applicationId?.status ? (
                    <StatusBadge status={check.applicationId.status} />
                  ) : null}
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                    <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
                    {t(key)}
                  </span>
                  <Link
                    href={manageHref(check._id)}
                    className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-primary underline-offset-2 hover:underline sm:min-h-0"
                  >
                    {t("checksManage")}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
