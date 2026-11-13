"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ClipboardList, Loader2, FileText, Upload, PenLine, CheckCircle2,
  Download, Building2, Calendar, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { seekerKeys, useSeekerResource } from "@/hooks/useSeekerCache";
import { formatDate as formatIntlDate } from "@/lib/ui/intlFormat";
import { ApplicationJourneyShell } from "@/components/features/job-seeker/ApplicationJourneyShell";
import { onboardingDocState } from "@/lib/onboarding/documentState";

type OnboardingStatus = "not_started" | "in_progress" | "completed";
type DocStatus = "requested" | "submitted" | "signed" | "approved";

interface OnboardingDoc {
  index: number;
  name: string;
  url: string | null;
  requestedFromCandidate: boolean;
  requiresSignature: boolean;
  status: DocStatus | null;
  uploadedBy: string | null;
  dueDate: string | null;
  signature: { fullName: string; signedAt: string } | null;
  reviewNote: string | null;
}

interface Onboarding {
  _id: string;
  status: OnboardingStatus;
  startDate: string | null;
  probation: { endDate: string | null; status: string | null } | null;
  documents: OnboardingDoc[];
  placement: { jobTitle: string | null; companyName: string | null; startDate: string | null };
}

const DOC_STATUS_STYLES: Record<DocStatus, string> = {
  requested: "bg-amber-100 text-amber-700 border-amber-300",
  submitted: "bg-sky-100 text-sky-700 border-sky-300",
  signed: "bg-emerald-100 text-emerald-700 border-emerald-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

function formatDate(value?: string | null): string {
  if (!value) return "";
  try {
    return formatIntlDate(new Date(value), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function JobSeekerOnboardingPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("jobSeekerOnboarding");
  const tj = useTranslations("jobSeekerJourney");

  // Cached: Back from a document shows the checklist at once; an upload or
  // signature refetches behind the rows instead of flashing the skeleton.
  const { data, isPending: loading, isError, refetch } = useSeekerResource<{ onboardings?: Onboarding[] }>(
    seekerKeys.onboarding,
    "/api/job-seeker/onboarding",
  );
  const onboardings = Array.isArray(data?.onboardings) ? data.onboardings : [];
  const error = isError && !data;
  const load = useCallback(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    document.title = `${t("title")} · MPLOYEDIN`;
  }, [t]);

  // The list is not paginated, so its length is the whole truth.
  const contextLine = loading ? undefined : error ? null : tj("contextOnboarding", { count: onboardings.length });

  return (
    <ApplicationJourneyShell locale={locale} context={contextLine}>
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card space-y-4 panel-body">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 rounded-xl border border-border/50 chip-pad">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 text-center text-sm text-destructive panel-body">
          {t("loadError")}
        </div>
      ) : onboardings.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-6">
          {onboardings.map((onboarding) => (
            <OnboardingCard key={onboarding._id} onboarding={onboarding} onChanged={load} />
          ))}
        </div>
      )}
    </ApplicationJourneyShell>
  );
}

function OnboardingCard({ onboarding, onChanged }: { onboarding: Onboarding; onChanged: () => void }) {
  const t = useTranslations("jobSeekerOnboarding");

  // Only the documents asked of the candidate are theirs to act on; the
  // employer's own checklist never reaches this page. Each one is sorted by
  // whose turn it is, so an uploaded file stops sitting under "Action needed".
  const requested = onboarding.documents.filter((doc) => doc.requestedFromCandidate);
  const toDo = requested.filter((doc) => onboardingDocState(doc).stage === "needs_action");
  const inReview = requested.filter((doc) => onboardingDocState(doc).stage === "in_review");
  const approved = requested.filter((doc) => onboardingDocState(doc).stage === "approved");
  const sentCount = inReview.length + approved.length;
  const progress = requested.length > 0 ? Math.round((sentCount / requested.length) * 100) : 0;
  const sharedDocs = onboarding.documents.filter((doc) => !doc.requestedFromCandidate && doc.url);

  const company = onboarding.placement.companyName ?? t("yourEmployer");
  const startDate = onboarding.startDate ?? onboarding.placement.startDate;

  const AMBER = "bg-amber-100 text-amber-700 border-amber-300";
  const BLUE = "bg-blue-100 text-blue-700 border-blue-300";
  const GREEN = "bg-emerald-100 text-emerald-700 border-emerald-300";
  // The badge answers "is it my turn?". With nothing asked, it falls back to
  // where the employer says the onboarding stands.
  const cardBadge =
    toDo.length > 0 ? { label: t("card_action"), style: AMBER }
      : inReview.length > 0 ? { label: t("card_waiting"), style: BLUE }
      : approved.length > 0 ? { label: t("card_approved"), style: GREEN }
      : {
          label: t(`status_${onboarding.status}`),
          style: onboarding.status === "completed" ? GREEN : onboarding.status === "in_progress" ? BLUE : AMBER,
        };

  const groups = [
    { key: "todo", title: t("actionNeeded"), hint: undefined, docs: toDo },
    { key: "review", title: t("inReviewTitle", { company }), hint: t("inReviewHint", { company }), docs: inReview },
    { key: "approved", title: t("approvedTitle"), hint: undefined, docs: approved },
  ].filter((group) => group.docs.length > 0);

  return (
    <div className="space-y-4 sm:space-y-5 rounded-3xl border border-border bg-card panel-body">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary sm:text-sm">
            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {company}
          </div>
          {/* A placement whose job was removed has no title; never leave the card
              without a heading saying which job this is. */}
          <p className="text-base font-semibold text-foreground sm:text-lg">{onboarding.placement.jobTitle ?? t("onboardingAt", { company })}</p>
          {startDate && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {t("startDate", { date: formatDate(startDate) })}
            </p>
          )}
        </div>
        <Badge variant="outline" className={`self-start ${cardBadge.style}`}>
          {cardBadge.label}
        </Badge>
      </div>

      {/* Welcome */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 text-xs sm:text-sm text-blue-900 card-pad">
        {t("welcomeMessage", { company })}
      </div>

      {/* Progress */}
      {requested.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{t("progress")}</p>
            <p className="text-sm text-muted-foreground">{t("tasksDone", { done: sentCount, total: requested.length })}</p>
          </div>
          <Progress value={progress} className="h-2" aria-label={t("progress")} />
        </div>
      )}

      {/* Probation */}
      {onboarding.probation?.endDate && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 text-sm card-pad">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {t("probationEnds", { date: formatDate(onboarding.probation.endDate) })}
          </span>
        </div>
      )}

      {/* Requested documents, grouped by whose turn it is */}
      {groups.length === 0 ? (
        <div className="space-y-3">
          <h3 className="heading-label font-semibold text-foreground">{t("nothingRequested")}</h3>
          <p className="text-sm text-muted-foreground">{t("noActionDocs")}</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="space-y-3">
            <div className="space-y-1">
              <h3 className="heading-label font-semibold text-foreground">{group.title}</h3>
              {group.hint && <p className="text-sm text-muted-foreground">{group.hint}</p>}
            </div>
            <ul className="divide-y divide-border/60">
              {group.docs.map((doc) => (
                <RequestedDocItem
                  key={doc.index}
                  onboardingId={onboarding._id}
                  company={company}
                  doc={doc}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      {/* Shared documents */}
      {sharedDocs.length > 0 && (
        <div className="space-y-3">
          <h3 className="heading-label font-semibold text-foreground">{t("sharedWithYou")}</h3>
          <ul className="divide-y divide-border/60">
            {sharedDocs.map((doc) => (
              <li key={doc.index} className="flex items-center gap-3 py-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground">{doc.name}</span>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="rounded-xl">
                      <Download className="mr-2 h-4 w-4" />
                      {t("download")}
                    </Button>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface RequestedDocItemProps {
  onboardingId: string;
  company: string;
  doc: OnboardingDoc;
  onChanged: () => void;
}

function RequestedDocItem({ onboardingId, company, doc, onChanged }: RequestedDocItemProps) {
  const t = useTranslations("jobSeekerOnboarding");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState("");

  const { stage, needsFile, needsSignature } = onboardingDocState(doc);
  // One badge, naming the next thing that happens to this document.
  const badge =
    stage === "approved" ? { label: t("stage_approved"), style: DOC_STATUS_STYLES.approved }
      : stage === "in_review" ? { label: t("stage_review"), style: DOC_STATUS_STYLES.submitted }
      : needsFile ? { label: t("stage_upload"), style: DOC_STATUS_STYLES.requested }
      : { label: t("stage_sign"), style: "border-purple-300 bg-purple-100 text-purple-700" };

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentIndex", String(doc.index));
      const res = await csrfFetch(`/api/job-seeker/onboarding/${onboardingId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("uploadFailed"));
        return;
      }
      // Say what happens next, not only that the file arrived.
      toast.success(doc.requiresSignature ? t("uploadSuccessSign") : t("uploadSuccess", { company }));
      onChanged();
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitSign() {
    if (signName.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/job-seeker/onboarding/${onboardingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIndex: doc.index, signatureName: signName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("signFailed"));
        return;
      }
      toast.success(t("signSuccess", { company }));
      setSignOpen(false);
      setSignName("");
      onChanged();
    } catch {
      toast.error(t("signFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <FileText className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      <div className="flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{doc.name}</span>
          <Badge variant="outline" className={badge.style}>{badge.label}</Badge>
        </div>
        {/* Sent back: the reason comes first, it is why this row is here again. */}
        {stage === "needs_action" && doc.reviewNote && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">{t("sentBackTitle", { company })}</span> {doc.reviewNote}
          </p>
        )}
        {stage === "needs_action" && needsFile && doc.requiresSignature && (
          <p className="text-xs text-muted-foreground">{t("uploadThenSign")}</p>
        )}
        {doc.dueDate && stage === "needs_action" && (
          <p className="text-xs text-muted-foreground">{t("dueDate", { date: formatDate(doc.dueDate) })}</p>
        )}
        {doc.signature && (
          <p className="text-xs text-emerald-600">
            {t("signedBy", { name: doc.signature.fullName, date: formatDate(doc.signature.signedAt) })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="rounded-xl">
              <FileText className="mr-2 h-4 w-4" />
              {t("view")}
            </Button>
          </a>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
          onChange={handleFile}
        />
        {/* Upload is the main button only while the file is owed. Once it is
            in, swapping it is a quiet option, not a second request; once the
            employer approved it, the document is closed. */}
        {stage !== "approved" && (
          <Button
            size="sm"
            variant={needsFile ? "default" : "ghost"}
            className="rounded-xl"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {needsFile ? t("upload") : t("replaceFile")}
          </Button>
        )}
        {stage === "needs_action" && !needsFile && needsSignature && (
          <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => setSignOpen(true)}>
            <PenLine className="mr-2 h-4 w-4" />
            {t("sign")}
          </Button>
        )}
        {stage === "approved" && <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />}
      </div>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("signTitle")}</DialogTitle>
            <DialogDescription>{t("signDescription", { document: doc.name })}</DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor={`sign-${doc.index}`}>{t("signNameLabel")}</Label>
            <Input
              id={`sign-${doc.index}`}
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              placeholder={t("signNamePlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setSignOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button className="rounded-xl" onClick={submitSign} disabled={busy || signName.trim().length < 2}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
              {t("signConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
