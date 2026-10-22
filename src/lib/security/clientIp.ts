export const FALLBACK_CLIENT = "direct";

/** Set by Vercel's edge; trusted only when VERCEL=1. */
const VERCEL_CLIENT_IP_HEADER = "x-vercel-forwarded-for";

/**
 * Headers an operator may nominate with TRUSTED_CLIENT_IP_HEADER. Deliberately
 * short and explicit: each is set by a specific edge/proxy product, so naming
 * one is a statement that the deployment sits behind that product and that it
 * overwrites whatever the caller sent. Lower-case; the env value is lower-cased
 * before the comparison. x-forwarded-for is not here on purpose, see
 * TRUSTED_PROXY_HOPS.
 */
const TRUSTED_CLIENT_IP_HEADERS = [
  "do-connecting-ip", // DigitalOcean App Platform
  "cf-connecting-ip", // Cloudflare
  "true-client-ip", // Cloudflare Enterprise / Akamai
  "fly-client-ip", // Fly.io
  "x-real-ip", // nginx-style reverse proxies
] as const;

type TrustedClientIpHeader = (typeof TRUSTED_CLIENT_IP_HEADERS)[number];

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) =>
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255
  );
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || value.includes("%")) return false;

  const halves = value.split("::");
  if (halves.length > 2) return false;

  const tokens = halves.flatMap((half) => half ? half.split(":") : []);
  let groups = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.includes(".")) {
      if (index !== tokens.length - 1 || !isIpv4(token)) return false;
      groups += 2;
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(token)) return false;
      groups += 1;
    }
  }

  return halves.length === 2 ? groups < 8 : groups === 8;
}

function validIp(value: string | undefined | null): string | null {
  const candidate = value?.trim();
  return candidate && (isIpv4(candidate) || isIpv6(candidate)) ? candidate : null;
}

/*
 * One-time warnings. This module is bundled for the proxy and for the route
 * handlers and may be instantiated more than once, so the "already said it"
 * set lives on globalThis: one line per process, not one per bundle or request.
 * console.warn, not @/lib/logger: the proxy runs on the Edge-compatible path
 * (see lib/auth/edge-config.ts) and the logger pulls in pino, which is not
 * known to load there. Keep this file free of Node-only imports.
 */
const WARNED_KEY = "__mployedinClientIpWarned";

function warnOnce(key: string, message: string): void {
  const store = globalThis as unknown as Record<string, Set<string> | undefined>;
  const warned = (store[WARNED_KEY] ??= new Set<string>());
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Lets a test see a warning again. Not for application code. */
export function resetClientIpWarningsForTests(): void {
  delete (globalThis as unknown as Record<string, unknown>)[WARNED_KEY];
}

/**
 * The header named by TRUSTED_CLIENT_IP_HEADER, lower-cased, or null when it is
 * unset, blank, or not on the allow-list (the last also logs one warning).
 */
function trustedClientIpHeader(): TrustedClientIpHeader | null {
  const raw = process.env.TRUSTED_CLIENT_IP_HEADER?.trim();
  if (!raw) return null;

  const name = raw.toLowerCase();
  const allowed = TRUSTED_CLIENT_IP_HEADERS.find((candidate) => candidate === name);
  if (allowed) return allowed;

  warnOnce(
    `bad-header:${name}`,
    `[clientIp] TRUSTED_CLIENT_IP_HEADER=${JSON.stringify(raw.slice(0, 64))} is not an allowed header and is ignored. ` +
      `Allowed: ${TRUSTED_CLIENT_IP_HEADERS.join(", ")}. ` +
      "Behind a chain of proxies that append to x-forwarded-for, use TRUSTED_PROXY_HOPS instead.",
  );
  return null;
}

function trustedProxyHops(): number {
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "0", 10);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/**
 * Resolve a client address only from proxy headers that the deployment is
 * explicitly configured to trust. Arbitrary X-Forwarded-For, X-Real-IP and
 * CF-Connecting-IP values are ignored by default: any caller can send them.
 *
 * Sources, first match wins:
 *   1. Vercel: VERCEL=1 and x-vercel-forwarded-for.
 *   2. TRUSTED_CLIENT_IP_HEADER: the one allow-listed header the operator names
 *      (e.g. do-connecting-ip on DigitalOcean App Platform).
 *   3. TRUSTED_PROXY_HOPS: the address that many proxies in from the right of
 *      x-forwarded-for.
 *   4. FALLBACK_CLIENT ("direct"): every caller shares one rate-limit bucket.
 * A source that is configured but yields no valid address (header missing or
 * not an IP) falls through to the next one.
 */
export function getClientIp(headers: Headers): string {
  const onVercel = process.env.VERCEL === "1";
  if (onVercel) {
    const vercelIp = validIp(headers.get(VERCEL_CLIENT_IP_HEADER)?.split(",")[0]);
    if (vercelIp) return vercelIp;
  }

  const trustedHeader = trustedClientIpHeader();
  if (trustedHeader) {
    const headerIp = validIp(headers.get(trustedHeader));
    if (headerIp) return headerIp;
  }

  const hops = trustedProxyHops();
  if (hops > 0) {
    const forwarded = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const index = Math.max(0, forwarded.length - hops);
    const forwardedIp = validIp(forwarded[index]);
    if (forwardedIp) return forwardedIp;

    const realIp = validIp(headers.get("x-real-ip"));
    if (realIp) return realIp;
  }

  // An unconfigured production deployment is reported once per process at start-up, through the repo logger
  // (instrumentation.ts), and on Admin > System health: see clientIpConfigurationProblem().
  return FALLBACK_CLIENT;
}

/** Where client addresses come from in this deployment. */
export type ClientIpHealth =
  | { status: "healthy" | "critical"; source: "none" }
  | { status: "healthy"; source: "vercel" }
  | { status: "healthy"; source: "header"; header: string }
  | { status: "healthy"; source: "proxy-hops"; hops: number };

/**
 * The configured client-IP source, for Admin > System health. "critical" only in production with no source: then
 * every visitor shares the "direct" rate-limit buckets (one script can lock sign-in, sign-up and password reset for
 * everyone) and every stored IP reads "direct". Elsewhere "none" is normal (a developer's machine).
 */
export function clientIpHealth(): ClientIpHealth {
  if (process.env.VERCEL === "1") return { status: "healthy", source: "vercel" };
  const header = trustedClientIpHeader();
  if (header) return { status: "healthy", source: "header", header };
  const hops = trustedProxyHops();
  if (hops > 0) return { status: "healthy", source: "proxy-hops", hops };
  return { status: process.env.NODE_ENV === "production" ? "critical" : "healthy", source: "none" };
}

/**
 * The deploy problem to report, or null. Logged as an error once per process at start-up (instrumentation.ts) —
 * deliberately not a start-up failure, which would take the site down instead.
 */
export function clientIpConfigurationProblem(): string | null {
  if (clientIpHealth().status !== "critical") return null;
  return (
    "[clientIp] No trusted client-IP source is configured (VERCEL, TRUSTED_CLIENT_IP_HEADER, TRUSTED_PROXY_HOPS), " +
    `so every client shares the "${FALLBACK_CLIENT}" rate-limit buckets and every stored IP address reads "${FALLBACK_CLIENT}". ` +
    "Set TRUSTED_CLIENT_IP_HEADER=do-connecting-ip on DigitalOcean App Platform (see DEPLOYMENT.md)."
  );
}

/**
 * Headers for the request the app sees after the proxy. x-forwarded-for becomes
 * the resolved address (or "direct"), so code that still reads it raw gets the
 * trusted value; x-real-ip is dropped unless it is the configured header.
 *
 * Route handlers call getClientIp on THESE headers, so the output must resolve
 * to the same address as the input: getClientIp(withTrustedClientIp(h)) ===
 * getClientIp(h). Every allow-listed client-IP header the operator did not name
 * is removed (nobody trusts it, so none should reach the app). The source that
 * getClientIp will read is kept and set to the resolved address, or removed
 * when nothing resolved, because deleting it would leave route handlers with no
 * source and collapse every client into "direct":
 *   - the configured TRUSTED_CLIENT_IP_HEADER, and
 *   - x-vercel-forwarded-for when VERCEL=1 (off Vercel it is just a header the
 *     caller chose, so it is always dropped).
 */
export function withTrustedClientIp(headers: Headers): Headers {
  const ip = getClientIp(headers);
  const trustedHeader = trustedClientIpHeader();
  const resolved = ip !== FALLBACK_CLIENT;

  const normalized = new Headers(headers);
  for (const name of TRUSTED_CLIENT_IP_HEADERS) normalized.delete(name);
  normalized.delete(VERCEL_CLIENT_IP_HEADER);
  normalized.set("x-forwarded-for", ip);
  if (trustedHeader && resolved) normalized.set(trustedHeader, ip);
  if (process.env.VERCEL === "1" && resolved) normalized.set(VERCEL_CLIENT_IP_HEADER, ip);
  return normalized;
}
