"use client";

import { useRef, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/shared/FieldError";
import { pickOutcomeFields, type GdprDecision, type GdprOutcomeFields } from "@/lib/gdpr/requestOutcome";
import { EMPTY_DECISION_VALUES, decisionSchema, type DecisionFormValues } from "./gdprDecisionSchema";
import type { GdprRequestRow } from "./types";

export type { GdprDecision } from "@/lib/gdpr/requestOutcome";

/** What the form sends: the new status and whichever of the three fields have text. */
export interface GdprDecisionPayload extends GdprOutcomeFields {
  status: GdprDecision;
}

interface GdprDecisionDialogProps {
  /** The request being decided. Kept by the caller after closing, so the content stays put while the dialog animates out. */
  request: GdprRequestRow | null;
  decision: GdprDecision;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the change; resolves true once it is stored. The dialog closes then, and stays open (text kept) on false. */
  onSubmit: (payload: GdprDecisionPayload) => Promise<boolean>;
}

/**
 * Complete or reject a data request. Completing may record what was done and
 * what was not (and why); rejecting needs a reason, because the person is told
 * why their request was refused (UK GDPR Art 12(4)). Both take internal notes
 * that only admins see.
 *
 * Both are final, and completing a deletion request erases the account, so the
 * wording the plain confirm used stays: the dialog still says what will happen.
 */
export function GdprDecisionDialog({ request, decision, open, onOpenChange, onSubmit }: GdprDecisionDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  // Set before the first await, so a second submit in the same tick can't slip past the state.
  const inFlight = useRef(false);

  const send = async (fields: GdprOutcomeFields) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    let saved = false;
    try {
      saved = await onSubmit({ status: decision, ...fields });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
    if (saved) onOpenChange(false);
  };

  // Closing mid-save would hide the result: wait for it.
  const requestClose = (next: boolean) => {
    if (!next && inFlight.current) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open && request !== null} onOpenChange={requestClose}>
      <DialogContent className="sm:max-w-lg" hideClose={submitting}>
        {/* The form lives in the content, which Radix unmounts on close, so every opening starts empty. */}
        {request && (
          <DecisionForm
            request={request}
            decision={decision}
            submitting={submitting}
            onSend={send}
            onCancel={() => requestClose(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DecisionFormProps {
  request: GdprRequestRow;
  decision: GdprDecision;
  submitting: boolean;
  onSend: (fields: GdprOutcomeFields) => void;
  onCancel: () => void;
}

function DecisionForm({ request, decision, submitting, onSend, onCancel }: DecisionFormProps) {
  const t = useTranslations("adminGdpr");
  const tc = useTranslations("common");
  const rejecting = decision === "rejected";
  // Completing a deletion request erases the account and cannot be undone.
  const erasing = !rejecting && request.requestType === "delete";

  const { register, handleSubmit, formState: { errors } } = useForm<DecisionFormValues>({
    resolver: zodResolver(
      decisionSchema(decision, {
        reasonRequired: t("decisionReasonRequired"),
        tooLong: (max) => t("decisionTooLong", { max }),
      }),
    ),
    defaultValues: EMPTY_DECISION_VALUES,
  });

  const message = rejecting
    ? t("confirmRejectMessage", { name: request.userName })
    : erasing
      ? t("confirmCompleteDeleteMessage", { name: request.userName })
      : t("confirmCompleteMessage", { name: request.userName });

  const submit = handleSubmit((values) =>
    onSend(pickOutcomeFields(rejecting ? { outcomeReason: values.outcomeReason, adminNotes: values.adminNotes } : values)),
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {/* End padding keeps the title and text clear of the dialog's close button. */}
      <DialogHeader className="pe-12 text-start sm:pe-10">
        <DialogTitle>{rejecting ? t("confirmRejectTitle") : t("confirmCompleteTitle")}</DialogTitle>
        {erasing ? (
          <DialogDescription className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
          </DialogDescription>
        ) : (
          <DialogDescription>{message}</DialogDescription>
        )}
      </DialogHeader>

      <div className="grid gap-4">
        {rejecting ? (
          <DecisionField
            id="gdpr-decision-reason"
            label={t("decisionReasonLabel")}
            hint={t("decisionReasonHint")}
            error={errors.outcomeReason?.message}
            required
            registration={register("outcomeReason")}
          />
        ) : (
          <>
            <DecisionField
              id="gdpr-decision-outcome"
              label={t("decisionOutcomeLabel")}
              error={errors.outcome?.message}
              registration={register("outcome")}
            />
            <DecisionField
              id="gdpr-decision-not-done"
              label={t("decisionNotDoneLabel")}
              hint={t("decisionNotDoneHint")}
              error={errors.outcomeReason?.message}
              registration={register("outcomeReason")}
            />
          </>
        )}
        <DecisionField
          id="gdpr-decision-notes"
          label={t("decisionNotesLabel")}
          error={errors.adminNotes?.message}
          registration={register("adminNotes")}
        />
        {/* What is written here stays on the register after the account is erased. */}
        {erasing && <p className="text-xs text-muted-foreground">{t("decisionErasureNoPersonalData")}</p>}
        {rejecting && <p className="text-xs text-muted-foreground">{tc("requiredFieldsNote")}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" disabled={submitting} onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button
          type="submit"
          variant={rejecting || erasing ? "destructive" : "default"}
          className="min-h-11 sm:min-h-10"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting && <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden="true" />}
          {rejecting ? t("rejectButton") : t("completeButton")}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface DecisionFieldProps {
  id: string;
  label: string;
  /** Shown under the field and read out with it. */
  hint?: string;
  error?: string;
  required?: boolean;
  registration: UseFormRegisterReturn;
}

function DecisionField({ id, label, hint, error, required, registration }: DecisionFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required={required}>{label}</Label>
      <Textarea
        id={id}
        rows={3}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className="resize-none"
        {...registration}
      />
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
