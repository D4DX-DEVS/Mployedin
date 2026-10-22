import { z } from "zod";
import { ADMIN_NOTES_MAX, OUTCOME_MAX, OUTCOME_REASON_MAX, type GdprDecision } from "@/lib/gdpr/requestOutcome";

/** The words the form's errors use; the caller passes them translated. */
export interface DecisionMessages {
  /** A refusal without a reason. */
  reasonRequired: string;
  /** Text over a field's limit. */
  tooLong: (max: number) => string;
}

/**
 * The Complete / Reject form's rules, the same as the server's
 * (adminGdprStatusSchema): every field is optional and trimmed, with the
 * model's limits, and a refusal needs a reason because the person is told why.
 */
export function decisionSchema(decision: GdprDecision, messages: DecisionMessages) {
  const text = (max: number) => z.string().trim().max(max, messages.tooLong(max));
  return z.object({
    outcome: text(OUTCOME_MAX),
    outcomeReason:
      decision === "rejected"
        ? text(OUTCOME_REASON_MAX).min(1, messages.reasonRequired)
        : text(OUTCOME_REASON_MAX),
    adminNotes: text(ADMIN_NOTES_MAX),
  });
}

export type DecisionFormValues = z.infer<ReturnType<typeof decisionSchema>>;

export const EMPTY_DECISION_VALUES: DecisionFormValues = { outcome: "", outcomeReason: "", adminNotes: "" };
