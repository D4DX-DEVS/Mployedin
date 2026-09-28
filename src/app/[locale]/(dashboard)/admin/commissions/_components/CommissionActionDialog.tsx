"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/ui/intlFormat";

export type CommissionActionMode = "dispute" | "clawback";

export interface CommissionActionTarget {
  id: string;
  name: string;
  amount: number;
  currency: string;
}

export interface CommissionActionValues {
  reason: string;
  clawbackAmount?: number;
}

interface CommissionActionDialogProps {
  mode: CommissionActionMode | null;
  target: CommissionActionTarget | null;
  onClose: () => void;
  /** Reject with a user-facing Error to keep the dialog open and show it. */
  onSubmit: (values: CommissionActionValues) => Promise<void>;
}

/** Dispute or claw back one commission: reason (and amount) in a dialog, not window.prompt(). */
export function CommissionActionDialog({ mode, target, onClose, onSubmit }: CommissionActionDialogProps) {
  const open = mode !== null && target !== null;
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      {open ? (
        // Keyed so every row opens a fresh form.
        <CommissionActionForm key={`${mode}-${target.id}`} mode={mode} target={target} onClose={onClose} onSubmit={onSubmit} />
      ) : null}
    </Dialog>
  );
}

interface CommissionActionFormProps {
  mode: CommissionActionMode;
  target: CommissionActionTarget;
  onClose: () => void;
  onSubmit: (values: CommissionActionValues) => Promise<void>;
}

function CommissionActionForm({ mode, target, onClose, onSubmit }: CommissionActionFormProps) {
  const t = useTranslations("adminCommissions");
  const tc = useTranslations("common");
  const isClawback = mode === "clawback";
  const fullAmount = `${target.currency} ${formatCount(target.amount)}`;

  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(String(target.amount));
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = reason.trim();
    const clawbackAmount = isClawback ? Number(amount) : undefined;
    const nextReasonError = trimmed ? null : t("reasonRequired");
    const nextAmountError = isClawback && !(clawbackAmount! > 0 && clawbackAmount! <= target.amount)
      ? t("invalidClawbackAmount", { amount: fullAmount })
      : null;
    setReasonError(nextReasonError);
    setAmountError(nextAmountError);
    setSubmitError(null);
    if (nextReasonError || nextAmountError) return;

    setPending(true);
    try {
      await onSubmit({ reason: trimmed, clawbackAmount });
      onClose();
    } catch (err) {
      const fallback = isClawback ? t("failedClawback") : t("failedDispute");
      setSubmitError(err instanceof Error && err.message ? err.message : fallback);
      setPending(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      {/* Clears the close button: 44px on the phone sheet, where the header is centred. */}
      <DialogHeader className="px-12 sm:ps-0 sm:pe-10">
        <DialogTitle>{isClawback ? t("clawbackTitle") : t("disputeTitle")}</DialogTitle>
        <DialogDescription>
          {isClawback ? t("clawbackDescription") : t("disputeDescription")}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/60 px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{target.name}</span>
          <span className="shrink-0 font-semibold text-foreground">{fullAmount}</span>
        </div>

        {submitError ? (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="commission-action-reason">
            {t("reasonLabel")}
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Textarea
            id="commission-action-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(null); }}
            placeholder={isClawback ? t("clawbackReasonPlaceholder") : t("disputeReasonPlaceholder")}
            rows={3}
            maxLength={1000}
            autoFocus
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? "commission-action-reason-error" : undefined}
          />
          {reasonError ? (
            <p id="commission-action-reason-error" className="text-xs text-destructive">{reasonError}</p>
          ) : null}
        </div>

        {isClawback ? (
          <div className="space-y-2">
            <Label htmlFor="commission-action-amount">
              {t("clawbackAmountLabel", { currency: target.currency })}
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="commission-action-amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={target.amount}
              step="any"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); if (amountError) setAmountError(null); }}
              aria-invalid={amountError ? true : undefined}
              aria-describedby="commission-action-amount-note"
            />
            <p
              id="commission-action-amount-note"
              className={amountError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {amountError ?? t("clawbackAmountHint", { amount: fullAmount })}
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" variant={isClawback ? "destructive" : "default"} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? tc("saving") : isClawback ? t("clawbackButton") : t("disputeTitle")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
