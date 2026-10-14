"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { formatCount } from "@/lib/ui/intlFormat";
import { hasBudget, type ExhibitionRequest, type ReviewAction } from "../_lib/exhibitions";

interface ExhibitionReviewDialogProps {
  item: ExhibitionRequest | null;
  action: ReviewAction | null;
  onClose: () => void;
  /** Called after the server accepted the move. */
  onDone: () => void;
}

const TITLE_KEYS: Record<ReviewAction, string> = {
  under_review: "reviewStartReview",
  approved: "reviewApproveExhibition",
  revision_requested: "reviewRequestRevision",
  rejected: "reviewRejectExhibition",
};

const TOAST_KEYS: Record<ReviewAction, string> = {
  under_review: "toastReviewStarted",
  approved: "toastExhibitionApproved",
  revision_requested: "toastExhibitionRevisionRequested",
  rejected: "toastExhibitionRejected",
};

/**
 * Start review / approve / request changes / reject. Reject and request
 * changes need a reason (the server refuses them without one), and approval
 * is operational only — it never allocates or delivers resources.
 */
export function ExhibitionReviewDialog({ item, action, onClose, onDone }: ExhibitionReviewDialogProps) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const [note, setNote] = useState("");
  const [budget, setBudget] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!item || !action) return;
    setNote("");
    setBudgetError("");
    setServerError("");
    // This role's own earlier recommendation, else what the agent asked for —
    // never the admin's binding figure.
    setBudget(item.recommendedBudget?.toString() ?? (hasBudget(item.estimatedBudget) ? item.estimatedBudget.toString() : ""));
  }, [item, action]);

  const needsReason = action === "rejected" || action === "revision_requested";
  const canSubmit = !submitting && (!needsReason || note.trim().length > 0);

  const submit = async () => {
    if (!item || !action || !canSubmit) return;
    const trimmed = note.trim() || undefined;
    const payload: Record<string, unknown> = { status: action, reviewNote: trimmed, statusReason: trimmed };
    if (action === "approved" && budget.trim()) {
      const parsed = Number(budget);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setBudgetError(t("reviewBudgetInvalid"));
        return;
      }
      payload.approvedBudget = parsed;
    }
    setSubmitting(true);
    setServerError("");
    try {
      const res = await csrfFetch(`/api/exhibitions/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(t(TOAST_KEYS[action]));
        onDone();
        return;
      }
      const err = await res.json().catch(() => ({}));
      setServerError(err.error ?? t("errorUpdatingExhibition"));
    } catch {
      setServerError(t("errorUpdatingExhibition"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!item && !!action} onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-w-md">
        {item && action && (
          <>
            <DialogHeader>
              <DialogTitle>{t(TITLE_KEYS[action])}</DialogTitle>
              <DialogDescription>
                {item.eventName} — {item.agentId?.name}
                {action === "approved" && (
                  <span className="mt-1 block text-[11px] text-amber-700">{t("reviewOperationalApprovalOnly")}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {action === "approved" && (
                <div>
                  <Label htmlFor="sa-review-budget">{t("reviewRecommendedBudget")} ({item.budgetCurrency})</Label>
                  <Input
                    id="sa-review-budget"
                    type="number"
                    min={0}
                    step="any"
                    value={budget}
                    onChange={(e) => { setBudget(e.target.value); setBudgetError(""); }}
                    aria-invalid={budgetError ? true : undefined}
                    placeholder={t("reviewRecommendedBudget")}
                  />
                  {budgetError ? (
                    <p className="mt-1 text-xs font-medium text-destructive" role="alert">{budgetError}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("reviewRequested")}: {hasBudget(item.estimatedBudget) ? `${item.budgetCurrency} ${formatCount(item.estimatedBudget)}` : t("notSpecified")}
                    </p>
                  )}
                  {(item.supportItems?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">{t("approveNoAllocationNote")}</p>
                  )}
                </div>
              )}
              {action !== "under_review" && (
                <div>
                  <Label htmlFor="sa-review-note">
                    {action === "rejected" ? t("rejectReasonLabel") : action === "revision_requested" ? t("reviewRevisionNotes") : t("reviewNotes")}
                  </Label>
                  <Textarea
                    id="sa-review-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={action === "rejected" ? t("rejectReasonPlaceholder") : action === "revision_requested" ? t("reviewRevisionNotesPlaceholder") : t("reviewNotesPlaceholder")}
                    rows={3}
                    aria-required={needsReason || undefined}
                  />
                  {needsReason && <p className="mt-1 text-xs text-muted-foreground">{t("reviewReasonShared")}</p>}
                </div>
              )}
              {serverError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{serverError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>{tc("cancel")}</Button>
              <Button
                onClick={submit}
                variant={action === "rejected" ? "destructive" : "default"}
                className={action === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : action === "revision_requested" ? "bg-orange-600 hover:bg-orange-700" : ""}
                disabled={!canSubmit}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {action === "rejected" ? t("actionReject") : action === "revision_requested" ? t("reviewRequestRevision") : action === "approved" ? t("actionApprove") : t("reviewStartReview")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
