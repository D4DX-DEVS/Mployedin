/**
 * Tenant-view cookie helpers — runs in both Edge (middleware) and Node runtimes.
 *
 * Cookie format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 * This lets the Edge middleware verify the cookie without a DB call.
 */

export const TENANT_COOKIE_NAME = "mployedin_tenant_view";

/** Shape stored inside the signed cookie */
export interface TenantCookiePayload {
  /** The actor's user ID (agent / super_agent / admin) */
  actorId: string;
  /** The employer's Employer._id */
  employerId: string;
  /** The employer's User._id (used to proxy API userId lookups) */
  employerUserId: string;
  /** Display name */
  companyName: string;
  /** Unix timestamp (seconds) */
  exp: number;
}

// ---------- internal helpers ----------

function b64uEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64uDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ---------- public API ----------

/** Sign a payload and return the cookie value string. */
export async function signTenantCookie(
  payload: TenantCookiePayload,
  secret: string
): Promise<string> {
  const data = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const key = await importKey(secret);
  const dataBytes = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes.buffer as ArrayBuffer);
  return `${data}.${b64uEncode(sig)}`;
}

/**
 * Verify the cookie value and return the payload, or `null` if invalid/expired.
 * Safe to call in Edge middleware (uses only Web Crypto).
 */
export async function verifyTenantCookie(
  value: string,
  secret: string
): Promise<TenantCookiePayload | null> {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const data = value.slice(0, dotIdx);
  const sigStr = value.slice(dotIdx + 1);

  try {
    const key = await importKey(secret);
    const sigBytes = b64uDecode(sigStr);
    const dataBytes = new TextEncoder().encode(data);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer as ArrayBuffer,
      dataBytes.buffer as ArrayBuffer
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(b64uDecode(data))
    ) as TenantCookiePayload;

    // Reject expired
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
