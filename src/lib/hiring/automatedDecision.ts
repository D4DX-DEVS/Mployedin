/**
 * Safeguards for decisions the screening worker makes with no person involved.
 *
 * UK GDPR Art 22A-D (Data (Use and Access) Act 2025, in force 5 Feb 2026):
 * someone subject to a significant decision based solely on automated
 * processing must be told, may make representations, and may obtain human
 * intervention and contest the decision. A rejection is such a decision.
 * So an auto-reject is recorded on the application, the candidate is always
 * told (whatever the employer's notification switch says), and the candidate's
 * "ask for a human review" puts the application back in front of the employer.
 */

import type { IAutomatedDecision } from "@/models/Application";

/** What the screening worker writes when it rejects on arrival. */
export function autoRejectDecision(score: number, threshold: number, now = new Date()): IAutomatedDecision {
  return { kind: "auto_reject", score, threshold, decidedAt: now };
}

/** A stored document (Dates) or the JSON a page received (ISO strings): only presence is read. */
interface DecisionCarrier {
  status?: string;
  automatedDecision?: {
    kind?: string;
    reviewRequestedAt?: Date | string | null;
    reviewedAt?: Date | string | null;
  } | null;
}

/** True while the candidate may still ask for a person to review the auto-reject. */
export function canRequestHumanReview(app: DecisionCarrier): boolean {
  const decision = app.automatedDecision;
  return decision?.kind === "auto_reject" && app.status === "rejected" && !decision.reviewRequestedAt;
}

/**
 * Called on every staff status change (single PATCH and bulk): the first one
 * after the candidate's request is the human review. Mutates the document.
 */
export function stampHumanReview(
  app: { automatedDecision?: IAutomatedDecision | null },
  reviewerId: unknown,
  now = new Date(),
): void {
  if (!app.automatedDecision || !isHumanReviewPending(app)) return;
  app.automatedDecision = { ...app.automatedDecision, reviewedAt: now, reviewedBy: reviewerId as IAutomatedDecision["reviewedBy"] };
}

/** True when a review was asked for and no person has acted on the application since. */
export function isHumanReviewPending(app: DecisionCarrier): boolean {
  const decision = app.automatedDecision;
  return Boolean(decision?.reviewRequestedAt) && !decision?.reviewedAt;
}
