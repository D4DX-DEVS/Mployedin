/**
 * POST /api/admin/webhooks/[id]/test — Send a test ping to the webhook endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Webhook from "@/models/Webhook";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string }

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
  const webhook = await Webhook.findById(id).select("+secret").lean();
  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const payload = {
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    data: {
      message: "This is a test delivery from Mployedin",
      webhookId: id,
    },
  };

  const body = JSON.stringify(payload);
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

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    return NextResponse.json({
      success: response.ok,
      statusCode: response.status,
      responseTime,
      message: response.ok
        ? "Test delivered successfully"
        : `Endpoint returned HTTP ${response.status}`,
    });
  } catch (err) {
    const responseTime = Date.now() - start;
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({
      success: false,
      responseTime,
      message,
    });
  }
}

export const POST = withAuth(postHandler, { resource: "users", action: "update" });
