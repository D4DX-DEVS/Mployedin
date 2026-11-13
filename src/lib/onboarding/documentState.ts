/**
 * Where a document the employer asked the candidate for stands.
 *
 * Read from what is actually stored (file, signature, approval) rather than the
 * status label alone, so both sides and the routes agree:
 *   needs_action  the candidate still owes the file and/or the signature
 *   in_review     the candidate has done their part; the employer checks it
 *   approved      the employer accepted it; nothing more to do
 */
export type OnboardingDocStage = "needs_action" | "in_review" | "approved";

export interface OnboardingDocLike {
  status?: string | null;
  url?: string | null;
  requiresSignature?: boolean | null;
  signature?: unknown;
}

export interface OnboardingDocState {
  stage: OnboardingDocStage;
  needsFile: boolean;
  needsSignature: boolean;
}

export function onboardingDocState(doc: OnboardingDocLike): OnboardingDocState {
  if (doc.status === "approved") {
    return { stage: "approved", needsFile: false, needsSignature: false };
  }
  const needsFile = !doc.url;
  const needsSignature = Boolean(doc.requiresSignature) && !doc.signature;
  return {
    stage: needsFile || needsSignature ? "needs_action" : "in_review",
    needsFile,
    needsSignature,
  };
}
