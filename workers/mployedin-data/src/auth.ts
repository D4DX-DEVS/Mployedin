/**
 * Request signing between the app and this Worker. Both sides hold the same
 * secret (DATA_WORKER_SECRET). The app sends:
 *
 *   X-Mp-Timestamp: <unix ms>
 *   X-Mp-Signature: hex(HMAC-SHA256(secret, "<timestamp>.<METHOD>.<path+query>.<hex sha256(body)>"))
 *
 * The signature covers the method, the full path with query, and the body, so
 * a captured request cannot be replayed against another endpoint or with other
 * parameters; the timestamp limits replay of the same request to MAX_SKEW_MS.
 * Every write here is idempotent (ids), so a replay inside the window changes nothing.
 *
 * The app-side signer is src/lib/cloudflare/dataWorkerClient.ts; a test signs
 * with it and verifies with this file so the two cannot drift.
 */

export const MAX_SKEW_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(body: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(body)));
}

export async function signRequest(
  secret: string,
  timestamp: string,
  method: string,
  pathWithQuery: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = `${timestamp}.${method.toUpperCase()}.${pathWithQuery}.${await sha256Hex(body)}`;
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** Constant-time comparison of two hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type AuthResult = { ok: true } | { ok: false; reason: string };

export async function verifyRequest(
  secret: string | undefined,
  request: Request,
  body: string,
  now: number = Date.now(),
): Promise<AuthResult> {
  if (!secret || secret.length < 32) return { ok: false, reason: "worker secret not configured" };
  const timestamp = request.headers.get("x-mp-timestamp") ?? "";
  const signature = (request.headers.get("x-mp-signature") ?? "").toLowerCase();
  if (!/^\d{13}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: "missing signature" };
  if (Math.abs(now - Number(timestamp)) > MAX_SKEW_MS) return { ok: false, reason: "stale timestamp" };
  const url = new URL(request.url);
  const expected = await signRequest(secret, timestamp, request.method, url.pathname + url.search, body);
  return safeEqual(expected, signature) ? { ok: true } : { ok: false, reason: "bad signature" };
}
