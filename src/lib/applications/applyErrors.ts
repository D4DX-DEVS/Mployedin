/** Refusals the apply dialogs explain in their own words (keys under the dialog's `errors`). */
export type ApplyErrorKey = "planLimitReached" | "jobClosed";

/**
 * The dialog's copy for a refused application, or null to show the server's
 * message. Plan quotas arrive as bare codes, and a closed job (inactive, or
 * past its closing date before the expiry cron has run) as JOB_CLOSED — both
 * read better, and in the user's language, from the dialog's own messages.
 */
export function applyErrorKey(body: { error?: unknown; code?: unknown } | null | undefined): ApplyErrorKey | null {
  if (body?.error === "LIMIT_EXCEEDED" || body?.error === "SUBSCRIPTION_REQUIRED") return "planLimitReached";
  if (body?.code === "JOB_CLOSED") return "jobClosed";
  return null;
}
