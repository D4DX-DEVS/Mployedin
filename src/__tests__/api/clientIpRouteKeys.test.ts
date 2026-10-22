/**
 * @jest-environment node
 */
/**
 * Public routes that rate-limit per client must key on getClientIp, not on the
 * raw x-forwarded-for.
 *
 * The proxy normalises client-IP headers, but its matcher skips any path that
 * ends in .svg/.png/.jpg/.jpeg/.gif/.webp, API paths included, so
 * GET /api/public/blogs/a.png reaches the handler with whatever header the
 * caller wrote. A handler that read x-forwarded-for itself gave a caller a fresh
 * bucket per forged value. These tests call the handlers directly, which is the
 * same un-normalised path.
 */
import { NextRequest } from "next/server";

const checkRateLimit = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMIT_CONFIGS: {},
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/BlogPost", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/StaticPage", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Country", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));

import { GET as getBlog } from "@/app/api/public/blogs/[slug]/route";
import { GET as getPage } from "@/app/api/public/pages/[slug]/route";
import { GET as getCountries } from "@/app/api/countries/route";
import { GET as getSalary } from "@/app/api/salary-explorer/route";

type Handler = (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;

const routes: Array<[string, Handler, string]> = [
  ["/api/public/blogs/[slug]", getBlog as unknown as Handler, "http://localhost:3888/api/public/blogs/a.png"],
  ["/api/public/pages/[slug]", getPage as unknown as Handler, "http://localhost:3888/api/public/pages/a.png"],
  ["/api/countries", getCountries as unknown as Handler, "http://localhost:3888/api/countries"],
  ["/api/salary-explorer", getSalary as unknown as Handler, "http://localhost:3888/api/salary-explorer"],
];

const ENV_KEYS = ["VERCEL", "TRUSTED_PROXY_HOPS", "TRUSTED_CLIENT_IP_HEADER"] as const;
const env = process.env as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};

async function keyFor(handler: Handler, url: string, headers: Record<string, string>): Promise<string> {
  checkRateLimit.mockClear();
  // Refuse the request so the handler stops after the limiter and touches no model.
  checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });
  const res = await handler(new NextRequest(url, { headers }), { params: Promise.resolve({ slug: "a" }) });
  expect(res.status).toBe(429);
  expect(checkRateLimit).toHaveBeenCalledTimes(1);
  return String(checkRateLimit.mock.calls[0][0]);
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = env[key];
    delete env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

describe.each(routes)("%s", (_name, handler, url) => {
  it("gives a caller who rotates x-forwarded-for and x-real-ip no fresh bucket", async () => {
    const first = await keyFor(handler, url, { "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2" });
    const second = await keyFor(handler, url, { "x-forwarded-for": "203.0.113.3", "x-real-ip": "203.0.113.4" });

    expect(second).toBe(first);
    expect(first).toMatch(/direct$/);
    expect(first).not.toContain("203.0.113");
  });

  it("keys on the trusted header the deployment names, and still ignores the caller's x-forwarded-for", async () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";

    const key = await keyFor(handler, url, { "do-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.1" });

    expect(key).toMatch(/198\.51\.100\.7$/);
    expect(key).not.toContain("203.0.113.1");
  });
});
