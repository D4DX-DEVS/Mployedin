/**
 * Webhook dispatcher — finds matching active webhooks and delivers payloads.
 *
 * Each delivery includes an HMAC-SHA256 signature for verification.
 * Retries up to `webhook.retryCount` times with exponential backoff.
 * Runs fire-and-forget so it never blocks the request.
 */

import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";
import Webhook from "@/models/Webhook";
import User from "@/models/User";
import type { WebhookEvent, IWebhook } from "@/models/Webhook";
import logger from "@/lib/logger";
import { safeFetch } from "@/lib/security/ssrf";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch a webhook event to all matching active webhooks.
 * Non-blocking — errors are caught and logged, never thrown to caller.
 *
 * SECURITY (SEC-A1): `employerId` is the tenant that owns the event. Only
 * webhooks registered by that employer, plus platform (admin) webhooks that
 * carry no `employerId`, receive it. Pass `null` for events with no owning
 * employer (e.g. commissions) — those reach platform webhooks only.
 */
export function dispatchWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
  employerId: string | mongoose.Types.ObjectId | null | undefined,
): void {
  // Fire-and-forget
  dispatchAsync(event, data, employerId).catch((err) => {
    logger.error({ err, webhookEvent: event }, "Webhook dispatch failed");
  });
}

/** Exported for tests — resolves the webhooks allowed to receive an event. */
export async function findWebhookTargets(
  event: WebhookEvent,
  employerId: string | mongoose.Types.ObjectId | null | undefined,
): Promise<IWebhook[]> {
  const tenantClause: Record<string, unknown>[] = [
    { employerId: { $exists: false } },
    { employerId: null },
  ];
  if (employerId && mongoose.isValidObjectId(employerId)) {
    tenantClause.push({ employerId: new mongoose.Types.ObjectId(String(employerId)) });
  }

  const webhooks = (await Webhook.find({
    events: event,
    isActive: true,
    $or: tenantClause,
  })
    .select("+secret")
    .lean()) as unknown as IWebhook[];

  // Webhooks without an employerId are treated as platform webhooks only when
  // an admin created them. Legacy employer-created rows (pre-SEC-A1, no
  // employerId) fail closed rather than receiving every tenant's events.
  const unscoped = webhooks.filter((w) => !w.employerId);
  if (unscoped.length === 0) return webhooks;
  const adminIds = new Set(
    (
      await User.find({
        _id: { $in: unscoped.map((w) => w.createdBy) },
        role: "admin",
      })
        .select("_id")
        .lean()
    ).map((u) => String((u as { _id: unknown })._id)),
  );
  return webhooks.filter((w) => w.employerId || adminIds.has(String(w.createdBy)));
}

async function dispatchAsync(
  event: WebhookEvent,
  data: Record<string, unknown>,
  employerId: string | mongoose.Types.ObjectId | null | undefined,
): Promise<void> {
  await connectDB();

  const webhooks = await findWebhookTargets(event, employerId);

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
