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

/**
 * Resolve a client address only from proxy headers that the deployment is
 * explicitly configured to trust. Arbitrary X-Forwarded-For values are ignored
 * by default.
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

  // Try common proxy headers before falling back to constant
  const cfIp = validIp(headers.get("cf-connecting-ip"));
  if (cfIp) return cfIp;

  return FALLBACK_CLIENT;
}

export function withTrustedClientIp(headers: Headers): Headers {
  const normalized = new Headers(headers);
  normalized.set("x-forwarded-for", getClientIp(headers));
  normalized.delete("x-real-ip");
  normalized.delete("x-vercel-forwarded-for");
  return normalized;
}
