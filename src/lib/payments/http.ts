/**
 * Small helpers shared by the fetch-based gateway adapters (no provider SDKs).
 */

import crypto from "crypto";

/**
 * Stripe-style form encoding with bracket notation:
 *   { line_items: [{ price_data: { currency: "aed" } }] }
 *   → line_items[0][price_data][currency]=aed
 * `undefined` / `null` values are skipped.
 */
export function toFormBody(obj: Record<string, unknown>): string {
  const pairs: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
      return;
    }
    if (typeof value === "object" && !(value instanceof Date)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, `${key}[${k}]`);
      }
      return;
    }
    const str = value instanceof Date ? String(Math.floor(value.getTime() / 1000)) : String(value);
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(str)}`);
  };
  for (const [k, v] of Object.entries(obj)) walk(v, k);
  return pairs.join("&");
}

/** Constant-time comparison of two hex / ascii strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function sha256Hex(payload: string): string {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Request timeout for provider API calls. */
export const PROVIDER_TIMEOUT_MS = 20_000;

/** Metadata values must be short strings on both providers; drop empties. */
export function cleanMetadata(meta: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = String(v).slice(0, 250);
  }
  return out;
}

/** Basic e-mail shape check — providers reject malformed customer_email outright. */
export function isPlausibleEmail(email: string | undefined): email is string {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}
