/** Refusals the apply dialogs explain in their own words (keys under the dialog's `errors`). */
export type ApplyErrorKey = "planLimitReached" | "jobClosed" | "documentNotFound" | "cvRequired";

/**
 * The dialog's copy for a refused application, or null to show the server's
 * message. Plan quotas arrive as bare codes, and a closed job (inactive, or
 * past its closing date before the expiry cron has run) as JOB_CLOSED — both
 * read better, and in the user's language, from the dialog's own messages.
 * DOCUMENT_NOT_FOUND is a chosen CV that is no longer among the seeker's
 * documents: the application was refused rather than sent with another.
 * CV_REQUIRED is an application with no CV at all: every application carries one.
 */
export function applyErrorKey(body: { error?: unknown; code?: unknown } | null | undefined): ApplyErrorKey | null {
  if (body?.error === "LIMIT_EXCEEDED" || body?.error === "SUBSCRIPTION_REQUIRED") return "planLimitReached";
  if (body?.code === "JOB_CLOSED") return "jobClosed";
  if (body?.code === "DOCUMENT_NOT_FOUND") return "documentNotFound";
  if (body?.code === "CV_REQUIRED") return "cvRequired";
  return null;
}
