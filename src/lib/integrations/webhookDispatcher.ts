/**
 * Webhook dispatcher — finds matching active webhooks and delivers payloads.
 *
 * Each delivery includes an HMAC-SHA256 signature for verification.
 * Retries up to `webhook.retryCount` times with exponential backoff.
 * Runs fire-and-forget so it never blocks the request.
 */

import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import Webhook from "@/models/Webhook";
import User from "@/models/User";
import Employer from "@/models/Employer";
import type { WebhookEvent, IWebhook } from "@/models/Webhook";
import logger from "@/lib/logger";
import { safeFetch } from "@/lib/security/ssrf";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Who an event is about.
 *
 * `employerId` is the company whose data the payload carries. Leave it out for
 * events that belong to no single company (or whose owner is not an employer):
 * those go to platform webhooks only.
 */
export interface WebhookScope {
  employerId?: string | { toString(): string } | null;
}

/**
 * Events an employer-owned webhook is never sent, whatever the scope.
 * Commissions are what the platform pays its agents — not the employer's data.
 */
const PLATFORM_ONLY_PREFIXES = ["commission."] as const;

function isPlatformOnly(event: WebhookEvent): boolean {
  return PLATFORM_ONLY_PREFIXES.some((prefix) => event.startsWith(prefix));
}

/**
 * Dispatch a webhook event to the webhooks allowed to see it.
 * Non-blocking — errors are caught and logged, never thrown to caller.
 *
 * Pass `scope.employerId` whenever the payload is about one company; without
 * it only admin-created (platform) webhooks are called.
 */
export function dispatchWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
  scope: WebhookScope = {},
): void {
  // Fire-and-forget
  deliverWebhookEvent(event, data, scope).catch((err) => {
    logger.error({ err, webhookEvent: event }, "Webhook dispatch failed");
  });
}

/**
 * Keep only the webhooks that may receive this event.
 *
 * A row stores `createdBy` and nothing else about its owner, so ownership is
 * worked out here, on every dispatch, rather than from a stored field:
 *  - creator is an admin  -> platform webhook, receives everything;
 *  - anyone else          -> belongs to the employer that user owns, and only
 *                            receives events scoped to that same employer.
 * Default-deny: a creator with no employer, or who no longer exists, gets
 * nothing. Deriving it live means rows created before this check existed are
 * scoped without a data migration, and a demoted admin loses platform reach.
 */
async function filterByOwner(
  webhooks: IWebhook[],
  event: WebhookEvent,
  scope: WebhookScope,
): Promise<IWebhook[]> {
  const creatorIds = [...new Set(webhooks.map((w) => String(w.createdBy)))];

  const [users, employers] = await Promise.all([
    User.find({ _id: { $in: creatorIds } }).select("role").lean<{ _id: unknown; role?: string }[]>(),
    Employer.find({ userId: { $in: creatorIds } }).select("userId").lean<{ _id: unknown; userId: unknown }[]>(),
  ]);

  const adminIds = new Set(users.filter((u) => u.role === "admin").map((u) => String(u._id)));
  const employerByUser = new Map(employers.map((e) => [String(e.userId), String(e._id)]));

  const eventEmployerId = scope.employerId ? String(scope.employerId) : null;
  const employerMayReceive = eventEmployerId !== null && !isPlatformOnly(event);

  return webhooks.filter((webhook) => {
    const creator = String(webhook.createdBy);
    if (adminIds.has(creator)) return true;
    return employerMayReceive && employerByUser.get(creator) === eventEmployerId;
  });
}

/** Awaitable form of {@link dispatchWebhook}. Exported for tests. */
export async function deliverWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
  scope: WebhookScope = {},
): Promise<void> {
  await connectDB();

  const subscribed: IWebhook[] = await Webhook.find({
    events: event,
    isActive: true,
  })
    .select("+secret")
    .lean();

  if (subscribed.length === 0) return;

  const webhooks = await filterByOwner(subscribed, event, scope);
  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    webhooks.map((webhook) => deliverWithRetry(webhook, body, event)),
  );
}

async function deliverWithRetry(
  webhook: IWebhook,
  body: string,
  event: WebhookEvent,
): Promise<void> {
  const maxRetries = webhook.retryCount ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s, ...
      await sleep(1000 * Math.pow(2, attempt - 1));
    }

    const result = await attemptDelivery(webhook, body);

    // Update webhook record
    const updateOps: Record<string, unknown> = {
      lastTriggeredAt: new Date(),
      lastStatus: result.success ? "success" : "failed",
    };

    const logEntry = {
      event,
      status: result.success ? "success" : "failed",
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      error: result.error,
      deliveredAt: new Date(),
      // Only failures carry the body — it is what an admin replays from the
      // webhooks page. Keeping it on every success would bloat a 50-entry log
      // with data nobody re-sends.
      ...(result.success ? {} : { payload: body }),
    };

    await Webhook.findByIdAndUpdate(webhook._id, {
      $set: updateOps,
      $push: { deliveryLog: { $each: [logEntry], $slice: -50 } },
    });

    if (result.success) return;
  }
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

async function attemptDelivery(
  webhook: IWebhook,
  body: string,
): Promise<DeliveryResult> {
  const start = Date.now();

  try {
    // Compute HMAC-SHA256 signature
    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(body)
      .digest("hex");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Signature": `sha256=${signature}`,
      "X-Webhook-Id": String(webhook._id),
      "User-Agent": "Mployedin-Webhook/1.0",
      ...(webhook.headers ?? {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    const response = await safeFetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    if (response.ok) {
      return { success: true, statusCode: response.status, responseTime };
    }

    return {
      success: false,
      statusCode: response.status,
      responseTime,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err) {
    const responseTime = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, responseTime, error: message };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
