"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, CalendarClock, ExternalLink, FileText, PenLine, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/ui/intlFormat";
import { onboardingDocState, type OnboardingDocStage } from "@/lib/onboarding/documentState";

export type DocStatus = "requested" | "submitted" | "signed" | "approved";

export interface OnboardingDoc {
  name: string;
  url?: string;
  uploadedAt?: string;
  requestedFromCandidate?: boolean;
  requiresSignature?: boolean;
  status?: DocStatus;
  uploadedBy?: string;
  dueDate?: string;
  signature?: { fullName: string; signedAt: string };
  reviewNote?: string;
}

export function fmtDate(value?: string): string {
  if (!value) return "";
  try {
    return formatDate(new Date(value), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const STAGE_STYLES: Record<OnboardingDocStage, string> = {
  needs_action: "bg-amber-100 text-amber-700 border-amber-300",
  in_review: "bg-sky-100 text-sky-700 border-sky-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

const STAGE_LABEL_KEYS = {
  needs_action: "docStage.waiting",
  in_review: "docStage.review",
  approved: "docStage.approved",
} as const;

interface OnboardingDocumentsCardProps {
  documents: OnboardingDoc[];
  busy: boolean;
  /** Earliest pickable due date. */
  today: Date;
  onPatch: (body: Record<string, unknown>, successMsg?: string) => Promise<void>;
}

/**
 * Documents for one onboarding: what the candidate was asked for (and where
 * each one stands), links kept on file, and the form that adds either.
 */
export function OnboardingDocumentsCard({ documents, busy, today, onPatch }: OnboardingDocumentsCardProps) {
  const t = useTranslations("employerOnboarding");

  // Add-document form. Asking the candidate is what this card is mostly for.
  const [requestFromCandidate, setRequestFromCandidate] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [due, setDue] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(false);

  // "Ask again" dialog
  const [sendBackIndex, setSendBackIndex] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const sendBackDoc = sendBackIndex === null ? undefined : documents[sendBackIndex];

  function addDocument() {
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    if (requestFromCandidate) {
      const body: Record<string, unknown> = { name: trimmed, requestedFromCandidate: true, requiresSignature };
      if (due) body.dueDate = new Date(due).toISOString();
      void onPatch({ addDocument: body }, t("documentRequested"));
    } else {
      void onPatch({ addDocument: { name: trimmed, url: url.trim() || undefined } });
    }
    setName("");
    setUrl("");
    setDue("");
    setRequiresSignature(false);
  }

  async function sendBack() {
    if (sendBackIndex === null || reason.trim().length < 2) return;
    await onPatch(
      { document: { index: sendBackIndex, status: "requested", reviewNote: reason.trim() } },
      t("documentSentBack"),
    );
    setSendBackIndex(null);
    setReason("");
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card panel-body">
      <h2 className="heading-section font-semibold text-foreground">{t("documents")}</h2>
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("noDocuments")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {documents.map((doc, i) => {
            // Only a document asked of the candidate has a stage; a link kept
            // on file is just a link.
            const state = doc.requestedFromCandidate ? onboardingDocState(doc) : null;
            return (
              <li key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <FileText className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{doc.name}</span>
                    {state && (
                      <Badge variant="outline" className={STAGE_STYLES[state.stage]}>
                        {t(STAGE_LABEL_KEYS[state.stage])}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {state?.stage === "needs_action" && (
                      <span>{state.needsFile ? t("waitingFile") : t("waitingSignature")}</span>
                    )}
                    {doc.dueDate && state?.stage === "needs_action" && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        {t("due", { date: fmtDate(doc.dueDate) })}
                      </span>
                    )}
                    {doc.requiresSignature && !doc.signature && state?.stage !== "approved" && (
                      <span className="inline-flex items-center gap-1">
                        <PenLine className="h-3 w-3" aria-hidden="true" />
                        {t("requiresSignature")}
                      </span>
                    )}
                    {doc.signature && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <PenLine className="h-3 w-3" aria-hidden="true" />
                        {t("signedBy", { name: doc.signature.fullName, date: fmtDate(doc.signature.signedAt) })}
                      </span>
                    )}
                  </div>
                  {state?.stage === "needs_action" && doc.reviewNote && (
                    <p className="text-xs text-amber-800">{t("askedAgainNote", { note: doc.reviewNote })}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {doc.url && (
                    <Button asChild size="sm" variant="ghost" className="rounded-xl">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("viewFile")}
                      </a>
                    </Button>
                  )}
                  {/* Review happens once the candidate has finished their part. */}
                  {state?.stage === "in_review" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => { setReason(""); setSendBackIndex(i); }}
                        disabled={busy}
                      >
                        <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("askAgain")}
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-xl"
                        onClick={() => void onPatch({ document: { index: i, status: "approved" } }, t("documentApproved"))}
                        disabled={busy}
                      >
                        <BadgeCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("approve")}
                      </Button>
                    </>
                  )}
                  <Button
                    size="iconDense"
                    variant="ghost"
                    onClick={() => void onPatch({ removeDocumentIndex: i })}
                    disabled={busy}
                    aria-label={t("removeDocumentLabel", { document: doc.name })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add document: a section of this card, not a second box inside it. */}
      <div className="mt-2 space-y-3 border-t border-border/60 pt-4">
        <h3 className="heading-label font-semibold text-foreground">{t("addDocumentTitle")}</h3>
        {/* Two named choices instead of a tick box that silently swapped the form. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("documents")}>
          <Button
            type="button"
            size="sm"
            variant={requestFromCandidate ? "default" : "outline"}
            className="rounded-xl"
            aria-pressed={requestFromCandidate}
            onClick={() => setRequestFromCandidate(true)}
          >
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("docModeRequest")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={requestFromCandidate ? "outline" : "default"}
            className="rounded-xl"
            aria-pressed={!requestFromCandidate}
            onClick={() => setRequestFromCandidate(false)}
          >
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("docModeReference")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {requestFromCandidate ? t("requestHint") : t("referenceHint")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("docNamePlaceholder")}
            aria-label={t("docNamePlaceholder")}
          />
          {requestFromCandidate ? (
            <DateTimePicker mode="date" value={due} onChange={setDue} placeholder={t("dueDate")} minDate={today} />
          ) : (
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("docUrlPlaceholder")}
              aria-label={t("docUrlPlaceholder")}
            />
          )}
        </div>
        {requestFromCandidate && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={requiresSignature} onCheckedChange={(c) => setRequiresSignature(Boolean(c))} />
            {t("requiresSignatureLabel")}
          </label>
        )}
        <Button onClick={addDocument} disabled={busy || name.trim().length < 1} className="rounded-xl">
          {requestFromCandidate
            ? <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}
          {requestFromCandidate ? t("sendRequest") : t("addDocument")}
        </Button>
      </div>

      {/* Ask again: the candidate has to know what was wrong with the first copy. */}
      <Dialog open={sendBackIndex !== null} onOpenChange={(open) => { if (!open) setSendBackIndex(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("askAgainTitle")}</DialogTitle>
            <DialogDescription>{t("askAgainDescription", { document: sendBackDoc?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor="send-back-reason">{t("askAgainReasonLabel")}</Label>
            <Textarea
              id="send-back-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("askAgainReasonPlaceholder")}
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setSendBackIndex(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button className="rounded-xl" onClick={() => void sendBack()} disabled={busy || reason.trim().length < 2}>
              <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("askAgainConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
