/**
 * Cron endpoint authentication.
 *
 * Verifies HMAC-SHA256 signed requests so cron callers must prove they hold
 * the secret — a static shared secret alone is vulnerable to log leakage and
 * replay attacks.
 *
 * Caller must send:
 *   X-Cron-Timestamp : Unix epoch seconds (string)
 *   X-Cron-Signature : HMAC-SHA256(secret, "timestamp:route"), hex-encoded
 *
 * Requests older than REPLAY_WINDOW_SEC are rejected (replay protection).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/** Max age for a signed cron request before it's rejected as a replay. */
const REPLAY_WINDOW_SEC = 5 * 60; // 5 minutes

/**
 * Verify a cron request.
 *
 * @returns `null` if the request is authorised, or a 401 NextResponse to return immediately.
 */
export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  // ── New signed-request path ───────────────────────────────────────────────
  const timestamp = req.headers.get("x-cron-timestamp");
  const signature = req.headers.get("x-cron-signature");

  if (timestamp && signature) {
    const nowSec = Math.floor(Date.now() / 1000);
    const tsSec = parseInt(timestamp, 10);

    if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > REPLAY_WINDOW_SEC) {
      return NextResponse.json({ error: "Request expired or clock skew too large" }, { status: 401 });
    }

    const route = new URL(req.url).pathname;
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}:${route}`)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    try {
      const expectedBuf = Buffer.from(expected, "hex");
      const receivedBuf = Buffer.from(signature, "hex");
      if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid signature format" }, { status: 401 });
    }

    return null; // authorised
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Generate the headers required to call a cron endpoint.
 * Use this in tests or internal cron callers.
 */
export function buildCronHeaders(route: string): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set");

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}:${route}`)
    .digest("hex");

  return {
    "x-cron-timestamp": timestamp,
    "x-cron-signature": signature,
  };
}
