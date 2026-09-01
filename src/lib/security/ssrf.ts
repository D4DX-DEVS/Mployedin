/**
 * SSRF egress guard for server-initiated fetches to user-controlled URLs.
 *
 * Blocks requests to private / loopback / link-local ranges (incl. the
 * 169.254.169.254 cloud-metadata endpoint) by resolving the hostname to its
 * real IPs and range-checking each one — a DNS name is not trusted on its face.
 *
 * ponytail: resolve-then-check has a TOCTOU DNS-rebind window (the kernel may
 * re-resolve at connect time to a different IP). Acceptable for this app; close
 * it only if you add an HTTP agent that pins the connection to the checked IP.
 */
import dns from "node:dns/promises";
import net from "node:net";
import logger from "@/lib/logger";

const MAX_REDIRECTS = 3;

/** ipv4 dotted-quad -> unsigned 32-bit int. */
function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

/** IPv4 ranges that must never be fetched, as [network, cidr-bits]. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local incl. cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function isBlockedV4(ip: string): boolean {
  const addr = ipv4ToInt(ip);
  return BLOCKED_V4.some(([net_, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (addr & mask) === (ipv4ToInt(net_) & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) — unwrap and check as v4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true; // multicast
  return false;
}

function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  return true; // not an IP literal we understand -> refuse
}

/**
 * Throws if `rawUrl` is not a public http(s) URL. Resolves DNS and checks every
 * returned address, so a hostname pointing at a private IP is rejected too.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs allowed");
  }

  // If the host is a literal IP, check it directly (skip DNS).
  if (net.isIP(url.hostname)) {
    if (isBlockedIp(url.hostname)) throw new Error("URL resolves to a blocked address");
    return url;
  }

  const records = await dns.lookup(url.hostname, { all: true });
  if (records.length === 0) throw new Error("Host does not resolve");
  for (const { address } of records) {
    if (isBlockedIp(address)) throw new Error("URL resolves to a blocked address");
  }
  return url;
}

/**
 * Throws if `hostname` resolves to a non-public address. For protocols that
 * have no URL to check — SMTP, for one, where the user supplies a bare host
 * and port and the transport dials it directly.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.trim();
  if (!host) throw new Error("Host is required");

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("Host resolves to a blocked address");
    return;
  }

  const records = await dns.lookup(host, { all: true });
  if (records.length === 0) throw new Error("Host does not resolve");
  for (const { address } of records) {
    if (isBlockedIp(address)) throw new Error("Host resolves to a blocked address");
  }
}

/**
 * fetch() wrapper that validates the target — and every redirect hop — against
 * the SSRF guard. Use for any server fetch of a user-controlled URL.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  throw new Error("Too many redirects");
}

// ponytail: self-check — run with `npx tsx src/lib/security/ssrf.ts`
if (process.argv[1]?.endsWith("ssrf.ts")) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  assert(isBlockedIp("127.0.0.1"), "loopback");
  assert(isBlockedIp("169.254.169.254"), "metadata");
  assert(isBlockedIp("10.1.2.3"), "private-10");
  assert(isBlockedIp("192.168.1.1"), "private-192");
  assert(isBlockedIp("172.16.5.5"), "private-172");
  assert(isBlockedIp("100.64.0.1"), "cgnat");
  assert(isBlockedIp("::1"), "v6-loopback");
  assert(isBlockedIp("::ffff:127.0.0.1"), "v6-mapped-loopback");
  assert(isBlockedIp("fd00::1"), "v6-ula");
  assert(!isBlockedIp("8.8.8.8"), "public-v4");
  assert(!isBlockedIp("2606:4700:4700::1111"), "public-v6");
  logger.info("ssrf guard self-check OK");
}
