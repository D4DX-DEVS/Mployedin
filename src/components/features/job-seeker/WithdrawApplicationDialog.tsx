"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";

// Values only — every label comes from jobSeekerApplications.withdrawal.reasons.*.
export const WITHDRAWAL_REASONS = [
  "accepted_elsewhere",
  "salary_too_low",
  "bad_experience",
  "too_slow_process",
  "changed_mind",
  "personal_reasons",
  "other",
] as const;

interface WithdrawApplicationDialogProps {
  applicationId: string;
  jobTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWithdrawn: () => void;
}

/**
 * Withdraw an application, with a reason. Shared by the Applications list and
 * the application page, so both ask the same question the same way.
 */
export function WithdrawApplicationDialog({
  applicationId,
  jobTitle,
  open,
  onOpenChange,
  onWithdrawn,
}: WithdrawApplicationDialogProps) {
  const t = useTranslations("jobSeekerApplications");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");

  // A fresh question each time it opens.
  useEffect(() => {
    if (open) {
      setReason("");
      setNote("");
      setError("");
    }
  }, [open]);

  async function handleWithdraw() {
    if (!reason) return;
    setWithdrawing(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "withdrawn",
          withdrawalReason: reason,
          withdrawalNote: note.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`withdraw ${res.status}`);
      onOpenChange(false);
      onWithdrawn();
    } catch {
      setError(t("withdrawal.failed"));
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !withdrawing && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("withdrawal.title")}</DialogTitle>
          <DialogDescription>{t("withdrawal.description", { job: jobTitle })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("withdrawal.reason")} <span className="text-destructive">{t("withdrawal.required")}</span>
            </label>
            <SearchableSelect
              options={WITHDRAWAL_REASONS.map((value) => ({ value, label: t(`withdrawal.reasons.${value}`) }))}
              value={reason}
              onValueChange={setReason}
              placeholder={t("withdrawal.selectReason")}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`withdraw-note-${applicationId}`} className="text-sm font-medium">
              {t("withdrawal.comments")} <span className="font-normal text-muted-foreground">({t("withdrawal.optional")})</span>
            </label>
            <Textarea
              id={`withdraw-note-${applicationId}`}
              placeholder={t("withdrawal.commentsPlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="resize-none"
            />
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={withdrawing}>
            {t("withdrawal.cancel")}
          </Button>
          <Button variant="destructive" className="gap-2" onClick={handleWithdraw} disabled={!reason || withdrawing}>
            {withdrawing && <Loader2 className="size-4 animate-spin" />}
            {t("withdrawal.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
