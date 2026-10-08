const FALLBACK_CLIENT = "direct";

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

/** 32-bit FNV-1a, hex. Sync and dependency-free so it also runs on the edge. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

let warnedNoProxyConfig = false;

/**
 * Resolve a client address only from proxy headers that the deployment is
 * explicitly configured to trust. Arbitrary X-Forwarded-For values are ignored
 * by default.
 *
 * Trust is opt-in per source: `VERCEL=1` (x-vercel-forwarded-for),
 * `TRUST_CLOUDFLARE=1` (cf-connecting-ip — only safe when the origin is
 * reachable solely through Cloudflare), `TRUSTED_PROXY_HOPS=N` (X-Forwarded-For
 * N hops from the right, then x-real-ip).
 *
 * With no proxy trusted, every request used to collapse to one constant key,
 * so a single client tripping an IP rate limit locked out every user. Instead
 * we fall back to x-real-ip, then a coarse per-client bucket (user-agent +
 * accept-language). Neither is spoof-proof — configure a trusted proxy.
 */
export function getClientIp(headers: Headers): string {
  if (process.env.VERCEL === "1") {
    const vercelIp = validIp(headers.get("x-vercel-forwarded-for")?.split(",")[0]);
    if (vercelIp) return vercelIp;
  }

  const trustedProxyHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "0", 10);
  if (Number.isInteger(trustedProxyHops) && trustedProxyHops > 0) {
    const forwarded = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const index = Math.max(0, forwarded.length - trustedProxyHops);
    const forwardedIp = validIp(forwarded[index]);
    if (forwardedIp) return forwardedIp;

    const realIp = validIp(headers.get("x-real-ip"));
    if (realIp) return realIp;
  }

  const trustCloudflare = process.env.TRUST_CLOUDFLARE === "1";
  if (trustCloudflare) {
    const cfIp = validIp(headers.get("cf-connecting-ip"));
    if (cfIp) return cfIp;
  }

  const hasProxyConfig =
    process.env.VERCEL === "1" || trustCloudflare || (Number.isInteger(trustedProxyHops) && trustedProxyHops > 0);
  if (!hasProxyConfig) {
    if (process.env.NODE_ENV === "production" && !warnedNoProxyConfig) {
      warnedNoProxyConfig = true;
      console.warn(
        "[clientIp] No trusted proxy configured (VERCEL, TRUST_CLOUDFLARE, TRUSTED_PROXY_HOPS). " +
          "IP rate limits fall back to x-real-ip / a user-agent bucket, which clients can spoof.",
      );
    }
    const realIp = validIp(headers.get("x-real-ip"));
    if (realIp) return realIp;
  }

  const userAgent = headers.get("user-agent") ?? "";
  const acceptLanguage = headers.get("accept-language") ?? "";
  if (userAgent || acceptLanguage) {
    return `anon-${fnv1a(`${userAgent}\n${acceptLanguage}`)}`;
  }

  return FALLBACK_CLIENT;
}

export function withTrustedClientIp(headers: Headers): Headers {
  const normalized = new Headers(headers);
  normalized.set("x-forwarded-for", getClientIp(headers));
  normalized.delete("x-real-ip");
  normalized.delete("x-vercel-forwarded-for");
  return normalized;
}
