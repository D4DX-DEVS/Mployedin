"use client";

/**
 * One background check, for whoever opened it: the employer's team or an
 * agent who works with the employer (owner decision 2026-10-14). What the
 * viewer may do comes from the server's `viewer` flags, never from the role
 * on this side, so the buttons can't offer something the API then refuses.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, FileText, Info, Loader2, NotebookPen, Play, ShieldCheck, UserCog, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ErrorState } from "@/components/shared/ErrorState";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { useCheckDetail } from "./useCheckDetail";
import { CheckProgressSteps, HistorySection, ReferencesSection, Section } from "./CheckDetailSections";
import {
  candidateNameOf,
  FINAL_OUTCOMES,
  personKind,
  personName,
  type CheckOutcome,
  type CheckPersonRef,
  type CheckStatus,
} from "./checkDetailTypes";

export const CHECK_STATUS_TONE: Record<CheckStatus, string> = {
  pending: "border-border bg-muted/40 text-muted-foreground",
  in_progress: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  cancelled: "border-border bg-muted/40 text-muted-foreground",
};
export const CHECK_OUTCOME_TONE: Record<CheckOutcome, string> = {
  clear: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  flagged: "border-amber-500/30 bg-amber-500/10 text-amber-800",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-700",
  unable_to_verify: "border-amber-500/30 bg-amber-500/10 text-amber-800",
  pending: "border-border bg-muted/40 text-muted-foreground",
};

interface CheckDetailPanelProps {
  apiBase: string;
  checkId: string | null;
  onClose: () => void;
  /** After any accepted change, so the list behind the panel can refresh its row. */
  onChanged?: () => void;
}

export function CheckDetailPanel({ apiBase, checkId, onClose, onChanged }: CheckDetailPanelProps) {
  const t = useTranslations("backgroundCheckWork");
  const locale = useLocale();
  const { data, loading, failed, pending, reload, act } = useCheckDetail(apiBase, checkId, onChanged);
  const [outcome, setOutcome] = useState<CheckOutcome>("pending");
  const [summary, setSummary] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  /** "Saved" shows after the findings reach the server, until the agent types again. */
  const [findingsSaved, setFindingsSaved] = useState(false);

  const check = data?.check;
  const viewer = data?.viewer;
  useEffect(() => {
    setSummary(check?.backgroundResults ?? "");
    setConfirmCancel(false);
  }, [check?._id, check?.backgroundResults]);
  useEffect(() => {
    setOutcome("pending");
    setFindingsSaved(false);
  }, [check?._id]);

  const when = (value?: string | null) => (value ? formatDateTime(value, { dateStyle: "medium", timeStyle: "short" }, locale) : "—");
  const who = (person?: CheckPersonRef | null) =>
    person ? `${personName(person)} · ${t(personKind(person) === "agent" ? "kindAgent" : "kindTeam")}` : "—";

  const summaryDirty = summary.trim() !== (check?.backgroundResults ?? "");
  const busy = pending !== null;

  const saveFindings = async () => {
    if (!summaryDirty) return;
    setFindingsSaved(await act({ action: "progress", backgroundResults: summary }, "findings"));
  };

  // Same rules the server applies on complete (workflow.ts), said up front
  // instead of after a refused click.
  const needsReplyForClear =
    outcome === "clear" &&
    (check?.checkType === "reference" || check?.checkType === "both") &&
    !(check?.references ?? []).some((r) => r.status === "responded");
  const completeBlocker: "outcome" | "summary" | "reply" | null =
    outcome === "pending" ? "outcome" : !summary.trim() ? "summary" : needsReplyForClear ? "reply" : null;

  return (
    <Dialog open={!!checkId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="space-y-2 border-b px-5 pb-4 pt-5 pe-14">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            {t("panelTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{check ? candidateNameOf(check) : t("panelTitle")}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <div className="flex-1 px-5 py-5">
            <ErrorState title={t("loadError")} onRetry={() => void reload()} />
          </div>
        ) : !check || !viewer || loading && !data ? (
          <div className="flex-1 space-y-4 px-5 py-5" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-lg font-semibold text-foreground">{candidateNameOf(check) || t("unknownCandidate")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={CHECK_STATUS_TONE[check.status]}>{t(`status.${check.status}`)}</Badge>
                    {check.outcome !== "pending" && (
                      <Badge variant="outline" className={CHECK_OUTCOME_TONE[check.outcome]}>{t(`outcome.${check.outcome}`)}</Badge>
                    )}
                  </div>
                </div>
                <p className="break-words text-sm text-muted-foreground">
                  {[check.jobId?.title, check.employerId?.companyName, t(`type.${check.checkType}`)].filter(Boolean).join(" · ")}
                </p>
              </div>

              {viewer.heldByOther && (
                <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("heldByOther", { name: personName(check.assignedTo) || t("someone") })}
                </p>
              )}
              {viewer.canWork && (
                <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("yoursToRun")}
                </p>
              )}

              {(check.status === "pending" || check.status === "in_progress") && (
                <CheckProgressSteps check={check} findingsWritten={!!summary.trim() || !!check.backgroundResults} />
              )}

              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t("requestedBy")}</dt>
                <dd className="min-w-0 break-words text-foreground">{who(check.createdBy)}</dd>
                <dt className="text-muted-foreground">{t("requestedOn")}</dt>
                <dd className="text-foreground">{when(check.requestedAt ?? check.createdAt)}</dd>
                <dt className="text-muted-foreground">{t("handledBy")}</dt>
                <dd className="min-w-0 break-words text-foreground">{check.assignedTo ? who(check.assignedTo) : t("nobodyYet")}</dd>
                <dt className="text-muted-foreground">{t("startedOn")}</dt>
                <dd className="text-foreground">{when(data.startedAt)}</dd>
                <dt className="text-muted-foreground">{t("completedBy")}</dt>
                <dd className="min-w-0 break-words text-foreground">{who(check.verifiedBy)}</dd>
                <dt className="text-muted-foreground">{t("completedOn")}</dt>
                <dd className="text-foreground">{when(check.verifiedAt ?? check.completedAt)}</dd>
              </dl>

              {viewer.canAssign && data.assignable.length > 0 && (
                <Section icon={UserCog} title={t("assignTitle")}>
                  <SearchableSelect
                    id="bc-assignee"
                    modal
                    ariaLabel={t("assignTitle")}
                    placeholder={t("assignNobody")}
                    value={check.assignedTo?._id ?? ""}
                    disabled={busy}
                    onValueChange={(value) => void act({ action: "assign", assignedTo: value || null })}
                    options={[
                      { value: "", label: t("assignNobody") },
                      ...data.assignable.map((p) => ({
                        value: p._id,
                        label: `${p.name} · ${t(p.kind === "agent" ? "kindAgent" : "kindTeam")}`,
                      })),
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">{t("assignHint")}</p>
                </Section>
              )}

              {check.references.length > 0 && (
                <ReferencesSection
                  references={check.references}
                  editable={viewer.canWork}
                  pending={pending}
                  onStatus={(index, status) => void act({ action: "progress", reference: { index, status } }, `ref-${index}`)}
                  onFeedback={(index, feedback) => void act({ action: "progress", reference: { index, feedback } }, `ref-${index}`)}
                />
              )}

              <Section
                icon={FileText}
                title={t("findingsTitle")}
                aside={
                  viewer.canWork && (pending === "findings" || findingsSaved) ? (
                    <span role="status" className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      {pending === "findings" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      )}
                      {pending === "findings" ? t("saving") : t("saved")}
                    </span>
                  ) : null
                }
              >
                {viewer.canWork ? (
                  <>
                    <label htmlFor="bc-findings" className="sr-only">{t("findingsTitle")}</label>
                    <Textarea
                      id="bc-findings"
                      value={summary}
                      onChange={(e) => {
                        setSummary(e.target.value);
                        setFindingsSaved(false);
                      }}
                      onBlur={() => void saveFindings()}
                      placeholder={t("findingsPlaceholder")}
                      className="min-h-24 text-sm"
                    />
                  </>
                ) : (
                  <p className="whitespace-pre-line break-words rounded-xl border bg-muted/30 px-3 py-2 text-sm text-foreground/90">
                    {check.backgroundResults || <span className="text-muted-foreground">{t("findingsEmpty")}</span>}
                  </p>
                )}
              </Section>

              {check.backgroundNotes !== undefined && (
                <Section icon={NotebookPen} title={t("notesTitle")}>
                  {viewer.canEditNotes ? (
                    <>
                      <label htmlFor="bc-notes" className="sr-only">{t("notesTitle")}</label>
                      <Textarea
                        id="bc-notes"
                        key={check.backgroundNotes}
                        defaultValue={check.backgroundNotes}
                        onBlur={(e) => e.target.value.trim() !== (check.backgroundNotes ?? "") && void act({ action: "notes", backgroundNotes: e.target.value })}
                        className="min-h-16 text-sm"
                      />
                    </>
                  ) : (
                    <p className="whitespace-pre-line break-words text-sm">{check.backgroundNotes}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t("notesHint")}</p>
                </Section>
              )}

              {viewer.canWork && (
                <Section icon={CheckCircle2} title={t("resultTitle")}>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("resultTitle")}>
                    {FINAL_OUTCOMES.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={outcome === value ? "default" : "outline"}
                        aria-pressed={outcome === value}
                        className="min-h-11 rounded-lg sm:min-h-9"
                        onClick={() => setOutcome(value)}
                      >
                        {t(`outcome.${value}`)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {outcome === "pending" ? t("resultHint") : t(`outcomeHelp.${outcome}`)}
                  </p>
                </Section>
              )}

              <HistorySection history={data.history} />
            </div>

            {(viewer.canStart || viewer.canWork || viewer.canCancel) && (
              <DialogFooter className="flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:space-x-0">
                {confirmCancel ? (
                  <>
                    <p className="text-sm text-foreground sm:me-auto sm:self-center">{t("cancelConfirm")}</p>
                    <Button variant="outline" disabled={busy} onClick={() => setConfirmCancel(false)}>{t("keepCheck")}</Button>
                    <Button variant="destructive" disabled={busy} onClick={() => void act({ action: "cancel" })}>
                      {pending === "cancel" && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                      {t("cancelCheck")}
                    </Button>
                  </>
                ) : (
                  <>
                    {viewer.canCancel && (
                      <Button variant="ghost" className={cn("text-destructive sm:me-auto")} disabled={busy} onClick={() => setConfirmCancel(true)}>
                        <XCircle className="me-1.5 h-4 w-4" aria-hidden="true" />
                        {t("cancelCheck")}
                      </Button>
                    )}
                    {viewer.canStart && (
                      <Button disabled={busy} onClick={() => void act({ action: "start" })}>
                        {pending === "start"
                          ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                          : <Play className="me-1.5 h-4 w-4" aria-hidden="true" />}
                        {t("startCheck")}
                      </Button>
                    )}
                    {viewer.canWork && completeBlocker && (
                      // Why Complete is greyed out, beside the button rather than scrolled away above it.
                      <p id="bc-complete-blocker" className="text-xs text-muted-foreground sm:me-auto sm:self-center">
                        {t(`completeBlocked.${completeBlocker}`)}
                      </p>
                    )}
                    {viewer.canWork && (
                      <Button
                        disabled={busy || completeBlocker !== null}
                        aria-describedby={completeBlocker ? "bc-complete-blocker" : undefined}
                        onClick={() => void act({ action: "complete", outcome, backgroundResults: summary })}
                      >
                        {pending === "complete" && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                        {t("completeCheck")}
                      </Button>
                    )}
                  </>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
