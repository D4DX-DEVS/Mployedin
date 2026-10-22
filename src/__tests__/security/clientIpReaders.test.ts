/**
 * @jest-environment node
 */
/**
 * Source guard: nothing under src reads a client-IP header by name except the
 * resolver in lib/security/clientIp.ts.
 *
 * Why: the proxy (src/proxy.ts) normalises these headers with
 * withTrustedClientIp, but its matcher skips any path that ends in .svg, .png,
 * .jpg, .jpeg, .gif or .webp, API paths included. So
 * GET /api/public/blogs/a.png reaches the route handler with whatever
 * x-forwarded-for the caller chose. A handler that reads that header itself
 * then rate-limits (or audits, or records a signature) on a value the caller
 * wrote. getClientIp ignores every header the deployment does not name, so it
 * is safe with or without the proxy; reading the header raw is not.
 *
 * Use getClientIp(req.headers) (route handlers) or getClientIp(await headers())
 * (server components and actions) instead.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

/**
 * Header names that carry (or can be made to carry) a client address. The first
 * five are the allow-list getClientIp accepts for TRUSTED_CLIENT_IP_HEADER; the
 * rest are other common spellings that a handler might reach for.
 */
const CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "do-connecting-ip",
  "true-client-ip",
  "fly-client-ip",
  "x-vercel-forwarded-for",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-original-forwarded-for",
];

/** A string literal that is exactly one of the header names (any case), in any quote style. */
const HEADER_LITERAL = new RegExp(`(["'\`])(?:${CLIENT_IP_HEADERS.join("|")})\\1`, "i");

/**
 * Files allowed to name a client-IP header, with the reason. Every entry must
 * still match, so a stale exception fails the test instead of lingering.
 */
const ALLOWED: Record<string, string> = {
  "lib/security/clientIp.ts": "the one resolver: decides which header, if any, is trusted",
};

/** Directories and files that are test support, not application code. */
const SKIP_DIRS = new Set(["__tests__", "__mocks__", "test-utils", "node_modules"]);

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.endsWith(".d.ts");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.[cm]?[jt]sx?$/.test(name) && !isTestFile(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Drops // and block comments so prose that mentions a header is not a read. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
    } else if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else {
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      out += ch;
      i += 1;
    }
  }
  return out;
}

export function readsClientIpHeader(source: string): boolean {
  return HEADER_LITERAL.test(stripComments(source));
}

describe("scanner (so the guard below cannot silently pass)", () => {
  it.each([
    [`req.headers.get("x-forwarded-for")`],
    [`req.headers.get('X-Forwarded-For')`],
    ["headers.get(`x-real-ip`)"],
    [`request.headers.get("cf-connecting-ip")`],
    [`const h = { "do-connecting-ip": value }`],
    [`req.headers.get("x-vercel-forwarded-for")`],
  ])("flags %s", (source) => {
    expect(readsClientIpHeader(source)).toBe(true);
  });

  it.each([
    [`// req.headers.get("x-forwarded-for") is no longer read`],
    [`/* x-real-ip: "x-real-ip" */ const a = 1;`],
    [`const doc = "see x-forwarded-for in the docs"`],
    [`getClientIp(req.headers)`],
    [`const url = "http://example.com/x-forwarded-for"; const b = getClientIp(h);`],
  ])("ignores %s", (source) => {
    expect(readsClientIpHeader(source)).toBe(false);
  });
});

describe("client-IP headers are read in one place", () => {
  const files = walk(SRC);

  it("scans the application source (not an empty walk)", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toContain("lib/security/clientIp.ts");
  });

  it("no file other than the resolver reads a client-IP header directly; use getClientIp(req.headers)", () => {
    const offenders = files
      .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
      .filter((rel) => !(rel in ALLOWED))
      .filter((rel) => readsClientIpHeader(readFileSync(path.join(SRC, rel), "utf8")));

    expect(offenders).toEqual([]);
  });

  it.each(Object.entries(ALLOWED))("the exception %s is still needed (%s)", (rel) => {
    const full = path.join(SRC, rel);
    expect(readsClientIpHeader(readFileSync(full, "utf8"))).toBe(true);
  });
});
