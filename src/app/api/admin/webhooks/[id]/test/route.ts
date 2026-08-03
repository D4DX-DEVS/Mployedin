/**
 * POST /api/admin/webhooks/[id]/test — Send a test ping to the webhook endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Webhook from "@/models/Webhook";
import { isValidObjectId } from "@/lib/security/sanitize";
import { safeFetch } from "@/lib/security/ssrf";

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

    const response = await safeFetch(webhook.url, {
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
    return NextResponse.json({
      success: false,
      responseTime,
      message: friendlyDeliveryError(err),
    });
  }
}

/** Map raw network errors to messages an admin can act on. */
function friendlyDeliveryError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const text = `${raw} ${cause}`;

  if (text.includes("ENOTFOUND") || text.includes("Host does not resolve"))
    return "Host not found — the URL's domain does not exist. Check the webhook URL.";
  if (text.includes("ECONNREFUSED"))
    return "Connection refused — the endpoint is not accepting requests.";
  if (err instanceof Error && err.name === "AbortError")
    return "Timed out — the endpoint did not respond within 10 seconds.";
  if (text.includes("blocked address") || text.includes("Only http(s)"))
    return "URL not allowed — webhooks must point to a public http(s) endpoint.";
  if (text.includes("certificate") || text.includes("CERT"))
    return "TLS certificate error — the endpoint's HTTPS certificate is invalid.";
  return raw || "Connection failed";
}

export const POST = withAuth(postHandler, { resource: "users", action: "update" });
