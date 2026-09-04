/**
 * POST /api/admin/webhooks/[id]/redeliver — replay a failed delivery.
 *
 * The webhooks page has always shown which deliveries failed and how many times
 * they were retried, and offered nothing to do about it: the only way to re-send
 * was to make the underlying event happen again, which an admin cannot do on
 * demand. This replays the exact body that failed, signed the same way the
 * dispatcher signs it, and appends the outcome to the same delivery log.
 *
 * A delivery recorded before payloads were retained has nothing to replay; that
 * is reported plainly rather than silently sending something else.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Webhook, { type IWebhookDelivery } from "@/models/Webhook";
import { isValidObjectId } from "@/lib/security/sanitize";
import { safeFetch } from "@/lib/security/ssrf";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string }

const DELIVERY_TIMEOUT_MS = 10_000;

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const segments = req.nextUrl.pathname.split("/");
  const id = segments[segments.indexOf("webhooks") + 1];
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  await connectDB();
  const webhook = await Webhook.findById(id).select("+secret");
  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const log = (webhook.deliveryLog ?? []) as IWebhookDelivery[];
  // Newest failure first — that is the one an admin means by "retry".
  const failed = [...log]
    .reverse()
    .find((entry) => entry.status === "failed" && entry.payload);

  if (!failed?.payload) {
    return NextResponse.json(
      {
        success: false,
        message:
          "No replayable delivery found. Deliveries recorded before payload retention cannot be replayed — the next failure will be.",
      },
      { status: 409 },
    );
  }

  const body = failed.payload;
  const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Signature": `sha256=${signature}`,
    "X-Webhook-Id": String(webhook._id),
    "X-Webhook-Redelivery": "true",
    "User-Agent": "Mployedin-Webhook/1.0",
    ...(webhook.headers ?? {}),
  };

  const start = Date.now();
  let success = false;
  let statusCode: number | undefined;
  let error: string | undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const response = await safeFetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    success = response.ok;
    statusCode = response.status;
    if (!response.ok) error = `Endpoint returned HTTP ${response.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "Connection failed";
  }

  const responseTime = Date.now() - start;

  // Same log the dispatcher writes, so the page needs no second source.
  webhook.lastTriggeredAt = new Date();
  webhook.lastStatus = success ? "success" : "failed";
  webhook.deliveryLog = [
    ...log,
    {
      event: failed.event,
      status: success ? "success" : "failed",
      statusCode,
      responseTime,
      error,
      deliveredAt: new Date(),
      ...(success ? {} : { payload: body }),
    } as IWebhookDelivery,
  ].slice(-50);
  await webhook.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "webhook.redeliver",
    resource: "webhooks",
    resourceId: String(webhook._id),
    meta: { event: failed.event, success, statusCode },
    req,
  });

  return NextResponse.json({
    success,
    statusCode,
    responseTime,
    event: failed.event,
    message: success ? "Delivery replayed successfully" : (error ?? "Delivery failed again"),
  });
}

export const POST = withAuth(postHandler, { resource: "users", action: "update" });
