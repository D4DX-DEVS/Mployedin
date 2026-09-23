import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { sendErrorAlert } from "@/lib/observability/alert";

/**
 * POST /api/client-errors — a browser crash caught by an error boundary
 * (src/lib/observability/report-error.ts). Public: errors happen on public
 * pages and for signed-out visitors too. Rate limited and size capped so it
 * can't be used to flood the log.
 */
const clip = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`client-errors:${ip}`, { limit: 20, windowSec: 60, prefix: "client-errors" });
  if (!allowed) return NextResponse.json({ error: "Too many reports" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = clip(body?.message, 1000);
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const fields = {
    event: "client_error",
    message,
    stack: clip(body.stack, 4000),
    source: clip(body.source, 100),
    digest: clip(body.digest, 100),
    url: clip(body.url, 500),
    userAgent: clip(req.headers.get("user-agent"), 300),
  };
  logger.error(fields, "Client error");
  void sendErrorAlert(
    `client:${fields.source ?? ""}:${message.slice(0, 120)}`,
    `Browser error${fields.source ? ` [${fields.source}]` : ""} on ${fields.url ?? "unknown page"}: ${message}`,
  );

  return new NextResponse(null, { status: 204 });
}
