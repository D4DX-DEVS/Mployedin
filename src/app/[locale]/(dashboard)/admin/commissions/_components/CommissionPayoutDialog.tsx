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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { formatCount } from "@/lib/ui/intlFormat";
import { COMMISSION_PAYMENT_METHODS } from "@/lib/validators/commissions";
import type { CommissionActionTarget } from "./CommissionActionDialog";

export type CommissionPaymentMethod = (typeof COMMISSION_PAYMENT_METHODS)[number];

export interface CommissionPayoutValues {
  paymentRef: string;
  paymentMethod: CommissionPaymentMethod;
  /** YYYY-MM-DD */
  paidAt: string;
}

interface CommissionPayoutDialogProps {
  target: CommissionActionTarget | null;
  onClose: () => void;
  /** Reject with a user-facing Error to keep the dialog open and show it. */
  onSubmit: (values: CommissionPayoutValues) => Promise<void>;
}

/** Local calendar day as YYYY-MM-DD — the admin's "today", not UTC's. */
function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Mark paid records how the money went out: method, reference and day. */
export function CommissionPayoutDialog({ target, onClose, onSubmit }: CommissionPayoutDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      {target ? <PayoutForm key={target.id} target={target} onClose={onClose} onSubmit={onSubmit} /> : null}
    </Dialog>
  );
}

function PayoutForm({ target, onClose, onSubmit }: CommissionPayoutDialogProps & { target: CommissionActionTarget }) {
  const t = useTranslations("adminCommissions");
  const tc = useTranslations("common");
  const [paymentMethod, setPaymentMethod] = useState<CommissionPaymentMethod>("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAt, setPaidAt] = useState(() => localDay());
  const [refError, setRefError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const methodOptions = COMMISSION_PAYMENT_METHODS.map((value) => ({ value, label: t(`paymentMethod.${value}`) }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ref = paymentRef.trim();
    const nextRefError = ref ? null : t("paymentRefRequired");
    const nextDateError = !paidAt ? t("paidAtRequired") : paidAt > localDay() ? t("paidAtFuture") : null;
    setRefError(nextRefError);
    setDateError(nextDateError);
    setSubmitError(null);
    if (nextRefError || nextDateError) return;

    setPending(true);
    try {
      await onSubmit({ paymentRef: ref, paymentMethod, paidAt });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : t("failedUpdateStatus"));
      setPending(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      {/* Clears the close button: 44px on the phone sheet, where the header is centred. */}
      <DialogHeader className="px-12 sm:ps-0 sm:pe-10">
        <DialogTitle>{t("payoutTitle")}</DialogTitle>
        <DialogDescription>{t("payoutDescription")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/60 px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{target.name}</span>
          <span className="shrink-0 font-semibold text-foreground">{target.currency} {formatCount(target.amount)}</span>
        </div>

        {submitError ? (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="commission-payout-method">{t("paymentMethodLabel")}</Label>
          <SearchableSelect
            id="commission-payout-method"
            options={methodOptions}
            value={paymentMethod}
            onValueChange={(value) => setPaymentMethod(value as CommissionPaymentMethod)}
            modal
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="commission-payout-ref">
            {t("paymentRefLabel")}
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="commission-payout-ref"
            value={paymentRef}
            onChange={(e) => { setPaymentRef(e.target.value); if (refError) setRefError(null); }}
            placeholder={t("paymentRefPlaceholder")}
            maxLength={200}
            autoComplete="off"
            aria-invalid={refError ? true : undefined}
            aria-describedby="commission-payout-ref-note"
          />
          <p id="commission-payout-ref-note" className={refError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {refError ?? t("paymentRefHint")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="commission-payout-date">
            {t("paidAtLabel")}
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <DateTimePicker
            id="commission-payout-date"
            mode="date"
            value={paidAt}
            onChange={(value) => { setPaidAt(value); if (dateError) setDateError(null); }}
            maxDate={new Date()}
            modal
            className="h-11 rounded-xl border-border bg-card text-sm"
          />
          {/* The picker's trigger takes no aria-describedby, so the error announces itself. */}
          {dateError ? <p id="commission-payout-date-error" role="alert" className="text-xs text-destructive">{dateError}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? tc("saving") : t("payoutSubmit")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
