/**
 * Scheduled Crons — Inngest functions that drive the platform's HTTP cron jobs.
 *
 * These REPLACE the external GitHub Actions scheduler
 * (.github/workflows/scheduled-crons.yml). Scheduling now lives inside the app
 * via Inngest Cloud, so there is NO need to store a PRODUCTION_URL variable or a
 * CRON_SECRET secret in GitHub.
 *
 * Each function makes an INTERNAL, HMAC-authenticated self-call to the existing
 * `/api/cron/*` route. Those routes are left completely untouched (and remain
 * usable by Vercel Cron via `vercel.json`). The cron secret is only ever used
 * server-side to sign the request — it never leaves the host.
 *
 * Schedules mirror the previous GitHub workflow exactly (all times UTC).
 */

import { inngest } from "./client";
import { buildCronHeaders } from "@/lib/security/cron-auth";
import logger from "@/lib/logger";

/**
 * Resolve the base URL for the in-process self-call. Order of preference:
 *   1. CRON_SELF_URL          — explicit override (recommended in production)
 *   2. NEXT_PUBLIC_APP_URL    — when set to a real (non-localhost) URL
 *   3. VERCEL_URL             — auto-provided on Vercel deployments
 *   4. http://127.0.0.1:$PORT — loopback fallback (DigitalOcean / local dev)
 */
function selfBaseUrl(): string {
  const explicit = process.env.CRON_SELF_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl && /^https?:\/\//.test(publicUrl) && !/localhost|127\.0\.0\.1/.test(publicUrl)) {
    return publicUrl.replace(/\/+$/, "");
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  const port = process.env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

/** Call an existing `/api/cron/*` endpoint with valid HMAC cron headers. */
async function triggerCron(path: string): Promise<{ path: string; status: number; body: string }> {
  const url = `${selfBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: buildCronHeaders(path),
    cache: "no-store",
    // Cron routes self-cap their work; a hung upstream must not pin the
    // Inngest step forever and mask the failure.
    signal: AbortSignal.timeout(270_000),
  });
  const body = (await res.text()).slice(0, 1000);
  if (!res.ok) {
    throw new Error(`Cron ${path} failed: ${res.status} ${body}`);
  }
  return { path, status: res.status, body };
}

/** Factory: build a scheduled Inngest function that triggers one cron endpoint. */
function makeScheduledCron(opts: { id: string; name: string; cron: string; path: string }) {
  return inngest.createFunction(
    {
      id: opts.id,
      name: opts.name,
      retries: 2,
      concurrency: { limit: 1 },
      triggers: [{ cron: opts.cron }],
    },
    async ({ step }: { step: any }) => {
      const result = await step.run("trigger-endpoint", () => triggerCron(opts.path));
      logger.info({ path: result.path, status: result.status }, "[scheduled-cron] triggered");
      return result;
    }
  );
}

// ── Hourly ────────────────────────────────────────────────────────────────────
export const interviewRemindersCron = makeScheduledCron({
  id: "scheduled-interview-reminders",
  name: "Interview Reminders (hourly)",
  cron: "0 * * * *",
  path: "/api/cron/interview-reminders",
});

export const savedSearchAlertsCron = makeScheduledCron({
  id: "scheduled-saved-search-alerts",
  name: "Saved Search Alerts (hourly)",
  cron: "0 * * * *",
  path: "/api/cron/saved-search-alerts",
});

// ── Daily ──────────────────────────────────────────────────────────────────────
export const subscriptionUsageResetCron = makeScheduledCron({
  id: "scheduled-subscription-usage-reset",
  name: "Subscription Usage Reset (00:00)",
  cron: "0 0 * * *",
  path: "/api/cron/subscription-usage-reset",
});

export const offerExpiryCron = makeScheduledCron({
  id: "scheduled-offer-expiry",
  name: "Offer Expiry (01:00)",
  cron: "0 1 * * *",
  path: "/api/cron/offer-expiry",
});

export const jobExpiryCron = makeScheduledCron({
  id: "scheduled-job-expiry",
  name: "Job Expiry — close expired jobs (02:00)",
  cron: "0 2 * * *",
  path: "/api/cron/job-expiry",
});

export const subscriptionExpiryCron = makeScheduledCron({
  id: "scheduled-subscription-expiry",
  name: "Subscription Expiry (03:00)",
  cron: "0 3 * * *",
  path: "/api/cron/subscription-expiry",
});

export const jobAlertsCron = makeScheduledCron({
  id: "scheduled-job-alerts",
  name: "Job Alerts (07:00)",
  cron: "0 7 * * *",
  path: "/api/cron/job-alerts",
});

export const leadFollowupReminderCron = makeScheduledCron({
  id: "scheduled-lead-followup-reminder",
  name: "Lead Follow-up Reminder (08:00)",
  cron: "0 8 * * *",
  path: "/api/cron/lead-followup-reminder",
});

export const invoiceOverdueReminderCron = makeScheduledCron({
  id: "scheduled-invoice-overdue-reminder",
  name: "Invoice Overdue Reminder (09:00)",
  cron: "0 9 * * *",
  path: "/api/cron/invoice-overdue-reminder",
});

// ── Weekly (Mondays) ─────────────────────────────────────────────────────────
export const targetRiskCheckCron = makeScheduledCron({
  id: "scheduled-target-risk-check",
  name: "Target Risk Check (Mon 08:00)",
  cron: "0 8 * * 1",
  path: "/api/cron/target-risk-check",
});

export const agentWeeklyDigestCron = makeScheduledCron({
  id: "scheduled-agent-weekly-digest",
  name: "Agent Weekly Digest (Mon 08:00)",
  cron: "0 8 * * 1",
  path: "/api/cron/agent-weekly-digest",
});

// ── Additional scheduled crons ──────────────────────────────────────────────
export const autoApplyCron = makeScheduledCron({
  id: "scheduled-auto-apply",
  name: "Auto Apply (hourly)",
  cron: "0 * * * *",
  path: "/api/cron/autoapply",
});

export const invoiceOverdueCron = makeScheduledCron({
  id: "scheduled-invoice-overdue",
  name: "Invoice Overdue (daily)",
  cron: "0 10 * * *",
  path: "/api/cron/invoice-overdue",
});

export const npsTriggerCron = makeScheduledCron({
  id: "scheduled-nps-trigger",
  name: "NPS Trigger (daily)",
  cron: "0 12 * * *",
  path: "/api/cron/nps-trigger",
});

export const slaAlertsCron = makeScheduledCron({
  id: "scheduled-sla-alerts",
  name: "SLA Alerts (hourly)",
  cron: "0 * * * *",
  path: "/api/cron/sla-alerts",
});

export const subscriptionReminderCron = makeScheduledCron({
  id: "scheduled-subscription-reminder",
  name: "Subscription Reminder (daily)",
  cron: "0 6 * * *",
  path: "/api/cron/subscription-reminder",
});

/** All scheduled cron functions, for registration in the Inngest serve route. */
export const scheduledCronFunctions = [
  interviewRemindersCron,
  savedSearchAlertsCron,
  subscriptionUsageResetCron,
  offerExpiryCron,
  jobExpiryCron,
  subscriptionExpiryCron,
  jobAlertsCron,
  leadFollowupReminderCron,
  invoiceOverdueReminderCron,
  targetRiskCheckCron,
  agentWeeklyDigestCron,
  autoApplyCron,
  invoiceOverdueCron,
  npsTriggerCron,
  slaAlertsCron,
  subscriptionReminderCron,
];
