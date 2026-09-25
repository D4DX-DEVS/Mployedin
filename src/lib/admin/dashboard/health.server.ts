import mongoose from "mongoose";
import AuditLog from "@/models/AuditLog";
import EmailLog from "@/models/EmailLog";
import User from "@/models/User";
import Webhook from "@/models/Webhook";
import type { DashboardPeriod } from "./period";
import type { HealthCheck, HealthStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── health thresholds ───────────────────────────────────────────────────
   Same cut-offs as /api/admin/system-health for the checks both show, so the
   dashboard tile and the health page never disagree about a colour. */

export function databaseStatus(latencyMs: number): HealthStatus {
  return latencyMs < 200 ? "healthy" : latencyMs < 500 ? "warning" : "critical";
}

export function webhookStatus(failing: number): HealthStatus {
  return failing === 0 ? "healthy" : failing >= 3 ? "critical" : "warning";
}

/** One failure is worth a look; ten in a day means delivery itself is broken. */
export function emailStatus(failed24h: number): HealthStatus {
  return failed24h === 0 ? "healthy" : failed24h >= 10 ? "critical" : "warning";
}

/** Locks expire on their own; many at once looks like credential stuffing. */
export function lockedAccountsStatus(locked: number): HealthStatus {
  return locked === 0 ? "healthy" : locked >= 10 ? "critical" : "warning";
}

/**
 * Technical checks only — business configuration (a missing default plan) is
 * an action-queue item. Background jobs and storage are not recorded anywhere
 * this page could read, so they are absent rather than shown as a green light.
 */
export async function getHealthChecks(period: DashboardPeriod): Promise<HealthCheck[]> {
  const { now } = period;
  const since = new Date(now.getTime() - DAY_MS);
  const pingStart = Date.now();
  await mongoose.connection.db?.admin().ping();
  const latencyMs = Date.now() - pingStart;

  const [failedEmails, failingWebhooks, lockedAccounts, failedSignIns] = await Promise.all([
    EmailLog.countDocuments({ status: "failed", sentAt: { $gte: since } }),
    Webhook.countDocuments({ isActive: true, lastStatus: "failed" }),
    User.countDocuments({ lockUntil: { $gt: now } }),
    AuditLog.countDocuments({ action: "login.failed", createdAt: { $gte: since } }),
  ]);

  return [
    { id: "database", status: databaseStatus(latencyMs), value: latencyMs, path: "/admin/system-health" },
    { id: "email", status: emailStatus(failedEmails), value: failedEmails, path: "/admin/settings/notifications?tab=email-logs&status=failed" },
    { id: "webhooks", status: webhookStatus(failingWebhooks), value: failingWebhooks, path: "/admin/webhooks?status=failing" },
    // Colour follows locked accounts (the system-health rule); failed sign-ins are context.
    { id: "authentication", status: lockedAccountsStatus(lockedAccounts), value: lockedAccounts, secondary: failedSignIns, path: "/admin/audit-logs?action=login.failed" },
  ];
}
