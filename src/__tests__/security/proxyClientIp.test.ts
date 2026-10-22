/**
 * @jest-environment node
 */
/**
 * What the proxy hands to route handlers: the request headers on the response
 * (`x-middleware-override-headers` lists the names that survive, and each value
 * is under `x-middleware-request-<name>`). Route handlers run getClientIp on
 * those headers, so a forged client-IP header must be gone and the trusted one
 * must still resolve to the same address.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/security/clientIp";

jest.mock("@/lib/auth/edge-config", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));
jest.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: () => () => NextResponse.next(),
}));

const ENV_KEYS = ["VERCEL", "TRUSTED_PROXY_HOPS", "TRUSTED_CLIENT_IP_HEADER"] as const;
const env = process.env as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};

/** The request headers the route handler would see after the proxy ran. */
async function forwardedHeaders(path: string, headers: Record<string, string>): Promise<Headers> {
  const { default: proxy } = await import("@/proxy");
  const req = new NextRequest(`http://localhost:3888${path}`, { headers });
  (req as unknown as { auth: unknown }).auth = null;
  const res = await (proxy as unknown as (r: NextRequest) => Promise<Response>)(req);

  const forwarded = new Headers();
  const names = (res.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
  for (const name of names) {
    const value = res.headers.get(`x-middleware-request-${name}`);
    if (value !== null) forwarded.set(name, value);
  }
  return forwarded;
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = env[key];
  for (const key of ENV_KEYS) delete env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

describe("proxy: client address handed to API route handlers", () => {
  it("with no trusted header, a forged cf-connecting-ip and x-forwarded-for never reach the route; every caller is \"direct\"", async () => {
    const seen = await forwardedHeaders("/api/consent/receipt", {
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "203.0.113.50",
      "x-real-ip": "203.0.113.51",
    });

    expect(seen.get("x-forwarded-for")).toBe("direct");
    expect(seen.has("cf-connecting-ip")).toBe(false);
    expect(seen.has("x-real-ip")).toBe(false);
    expect(getClientIp(seen)).toBe("direct");
  });

  it("with do-connecting-ip trusted, the route resolves that address and a forged cf-connecting-ip is gone", async () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";

    const seen = await forwardedHeaders("/api/consent/receipt", {
      "do-connecting-ip": "198.51.100.7",
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "203.0.113.50, 10.0.0.1",
    });

    expect(seen.get("x-forwarded-for")).toBe("198.51.100.7");
    expect(seen.get("do-connecting-ip")).toBe("198.51.100.7");
    expect(seen.has("cf-connecting-ip")).toBe(false);
    expect(getClientIp(seen)).toBe("198.51.100.7");
  });

  it("a request that carries only a forged cf-connecting-ip is \"direct\" even when do-connecting-ip is the trusted header", async () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";

    const seen = await forwardedHeaders("/api/consent/receipt", {
      "cf-connecting-ip": "203.0.113.9",
      "true-client-ip": "203.0.113.11",
      "fly-client-ip": "203.0.113.12",
      "x-real-ip": "203.0.113.13",
    });

    expect(seen.get("x-forwarded-for")).toBe("direct");
    // Every allow-listed client-IP header is gone, the configured one included
    // (it had no valid value, so nothing is written back into it).
    for (const name of ["do-connecting-ip", "cf-connecting-ip", "true-client-ip", "fly-client-ip", "x-real-ip"]) {
      expect(seen.has(name)).toBe(false);
    }
    expect(getClientIp(seen)).toBe("direct");
  });

  it("page requests get the same treatment", async () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";

    const seen = await forwardedHeaders("/en/login", {
      "do-connecting-ip": "198.51.100.7",
      "cf-connecting-ip": "203.0.113.9",
    });

    expect(seen.get("x-forwarded-for")).toBe("198.51.100.7");
    expect(seen.has("cf-connecting-ip")).toBe(false);
    expect(getClientIp(seen)).toBe("198.51.100.7");
  });
});
