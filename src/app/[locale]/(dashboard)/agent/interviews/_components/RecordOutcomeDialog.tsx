"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type InterviewOutcome = "passed" | "failed" | "hold" | "no_show";

export interface RecordOutcomeTarget {
  _id: string;
  candidateName: string;
  jobTitle?: string;
}

interface RecordOutcomeDialogProps {
  target: RecordOutcomeTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

const OUTCOMES: { value: InterviewOutcome; labelKey: string; icon: LucideIcon; selected: string }[] = [
  { value: "passed", labelKey: "outcomePassed", icon: CheckCircle2, selected: "border-status-selected bg-status-selected-bg text-emerald-700" },
  { value: "failed", labelKey: "outcomeFailed", icon: XCircle, selected: "border-status-rejected bg-status-rejected-bg text-status-rejected" },
  { value: "hold", labelKey: "outcomeOnHold", icon: Clock3, selected: "border-status-shortlisted bg-status-shortlisted-bg text-status-shortlisted" },
  { value: "no_show", labelKey: "outcomeNoShow", icon: AlertTriangle, selected: "border-foreground/40 bg-secondary text-foreground" },
];

/**
 * Closes an interview that has happened: outcome + optional feedback.
 *
 * The agent dashboard queues "No outcome recorded" rows and links here, but the
 * agent page offered only date/type/notes editing and a bare "Mark completed"
 * (no outcome) — so a queued interview could never leave the queue. The PATCH
 * sends `status: completed` with the outcome, which also runs the application
 * transitions (passed → next stage, failed → rejected) server side.
 */
export function RecordOutcomeDialog({ target, onClose, onSaved }: RecordOutcomeDialogProps) {
  const t = useTranslations("agentInterviews");
  const tc = useTranslations("common");
  const [outcome, setOutcome] = useState<InterviewOutcome | "">("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOutcome("");
    setFeedback("");
    setError("");
  }, [target?._id]);

  const submit = async () => {
    if (!target) return;
    if (!outcome) { setError(t("outcomeRequired")); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/interviews/${target._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", outcome, feedback: feedback.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : t("outcomeSaveFailed"));
        return;
      }
      toast.success(t("outcomeSaved", { name: target.candidateName }));
      onSaved();
      onClose();
    } catch {
      setError(t("outcomeSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("recordOutcomeTitle")}</DialogTitle>
          <DialogDescription>
            {target ? [target.candidateName, target.jobTitle].filter(Boolean).join(" · ") : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground">{t("outcomeLabel")}</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("outcomeLabel")}>
              {OUTCOMES.map(({ value, labelKey, icon: Icon, selected }) => {
                const active = outcome === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setOutcome(value); setError(""); }}
                    className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 py-2 text-start text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? selected : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="record-outcome-feedback">{t("outcomeFeedback")}</Label>
            <Textarea
              id="record-outcome-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder={t("outcomeFeedbackPlaceholder")}
            />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="min-h-11 sm:min-h-9">
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving} className="min-h-11 sm:min-h-9">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t("recordOutcomeSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
