/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const rateLimitMock = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

const assertPublicUrlMock = jest.fn();
jest.mock("@/lib/security/ssrf", () => ({
  assertPublicUrl: (...args: unknown[]) => assertPublicUrlMock(...args),
}));

const warnMock = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    warn: (...args: unknown[]) => warnMock(...args),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const fetchMock = jest.fn();

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c";
const LINKEDIN = "https://media.licdn.com/dms/image/v2/x/profile-displayphoto-shrink_100_100/0/1?e=1&t=sig";
const MAX_BYTES = 5 * 1024 * 1024;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function request(url?: string, headers: Record<string, string> = {}): NextRequest {
  const target = new URL("http://localhost:3000/api/proxy-image");
  if (url !== undefined) target.searchParams.set("url", url);
  return new NextRequest(target, { headers });
}

async function get(url?: string, headers: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import("@/app/api/proxy-image/route");
  return GET(request(url, headers));
}

function upstream(body: BodyInit | null, init: ResponseInit & { headers?: Record<string, string> } = {}): Response {
  return new Response(body, { status: 200, ...init, headers: { "content-type": "image/jpeg", ...init.headers } });
}

/** A body that yields `total` bytes in 64 KB chunks and records whether it was cancelled. */
function chunkedBody(total: number, state: { cancelled: boolean; pulled: number }): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const size = Math.min(chunk.length, total - sent);
      sent += size;
      state.pulled = sent;
      controller.enqueue(chunk.subarray(0, size));
    },
    cancel() {
      state.cancelled = true;
    },
  });
}

describe("GET /api/proxy-image", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 100, resetAt: Date.now() + 60_000 });
    assertPublicUrlMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(upstream(JPEG));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  describe("what it will fetch", () => {
    it("serves a Google avatar", async () => {
      const res = await get(GOOGLE);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(GOOGLE);
    });

    it("serves a LinkedIn avatar", async () => {
      const res = await get(LINKEDIN);
      expect(res.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe(LINKEDIN);
    });

    it.each([
      ["a Spaces bucket (any bucket, not just ours)", "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg"],
      ["a Spaces CDN URL", "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/avatars/a.jpg"],
      ["someone else's Spaces bucket", "https://attacker.nyc3.digitaloceanspaces.com/x.jpg"],
      ["Cloudinary", "https://res.cloudinary.com/demo/image/upload/a.jpg"],
      ["an unrelated host", "https://example.com/a.jpg"],
      ["a host that ends with an allowed name", "https://lh3.googleusercontent.com.evil.com/a.jpg"],
      ["a host that merely contains an allowed name", "https://evillh3.googleusercontent.com/a.jpg"],
      ["a bare provider domain that is not an avatar host", "https://googleusercontent.com/a.jpg"],
      ["credentials that make an allowed name the user, not the host", "https://lh3.googleusercontent.com@evil.com/a.jpg"],
      ["an allowed host with credentials", "https://user:pass@lh3.googleusercontent.com/a.jpg"],
      ["an allowed host on another port", "https://lh3.googleusercontent.com:8443/a.jpg"],
      ["localhost", "https://localhost/a.jpg"],
      ["a cloud-metadata address", "https://169.254.169.254/latest/meta-data"],
    ])("refuses %s with 403 and never fetches", async (_label, url) => {
      const res = await get(url);
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses plain http", async () => {
      const res = await get("http://lh3.googleusercontent.com/a/x");
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a missing, malformed or oversized url parameter", async () => {
      expect((await get()).status).toBe(400);
      expect((await get("not a url")).status).toBe(400);
      expect((await get(`https://lh3.googleusercontent.com/${"a".repeat(2100)}`)).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses an allowed host that resolves to a private address", async () => {
      assertPublicUrlMock.mockRejectedValue(new Error("blocked"));
      const res = await get(GOOGLE);
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never follows a redirect and answers 502 for one", async () => {
      fetchMock.mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
      );
      const res = await get(GOOGLE);
      expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: "manual" }));
      expect(res.status).toBe(502);
    });

    it("sets a timeout on the upstream request", async () => {
      await get(GOOGLE);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it("answers 502 in plain words when the upstream request throws", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));
      const res = await get(GOOGLE);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/couldn't/i);
      expect(body.error).not.toMatch(/socket|Failed to/);
    });
  });

  describe("what it sends back", () => {
    it("sends no Access-Control-Allow-Origin at all", async () => {
      const res = await get(GOOGLE);
      expect(res.headers.has("access-control-allow-origin")).toBe(false);
    });

    it("never forwards the upstream's cookies or other headers", async () => {
      fetchMock.mockResolvedValue(
        upstream(JPEG, {
          headers: {
            "set-cookie": "NID=abc; Domain=.google.com; HttpOnly",
            "x-goog-meta": "secret",
            "access-control-allow-origin": "*",
            "content-disposition": 'attachment; filename="x.jpg"',
            link: "<https://evil.test/>; rel=preload",
            server: "ESF",
            "cache-control": "private, max-age=0",
            "content-length": String(JPEG.length),
          },
        }),
      );
      const res = await get(GOOGLE);
      expect(res.status).toBe(200);
      expect(res.headers.has("set-cookie")).toBe(false);
      for (const name of ["x-goog-meta", "access-control-allow-origin", "content-disposition", "link", "server"]) {
        expect(res.headers.has(name)).toBe(false);
      }
      expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    });

    it("builds its own headers: type, cache and nosniff", async () => {
      const res = await get(GOOGLE);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-type")).toBe("image/jpeg");
    });

    it("does not claim a Content-Security-Policy of its own: src/proxy.ts replaces it with the API policy on the way out, so refusing SVG and nosniff are what protect", async () => {
      const res = await get(GOOGLE);
      expect(res.headers.has("content-security-policy")).toBe(false);
    });

    it("drops parameters from the upstream content type", async () => {
      fetchMock.mockResolvedValue(upstream(JPEG, { headers: { "content-type": "Image/JPEG; charset=binary" } }));
      const res = await get(GOOGLE);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
    });

    it.each(["image/png", "image/webp", "image/gif", "image/avif"])("serves %s", async (type) => {
      fetchMock.mockResolvedValue(upstream(JPEG, { headers: { "content-type": type } }));
      const res = await get(GOOGLE);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(type);
    });

    it("refuses SVG outright: it can carry script and this answers on our origin", async () => {
      fetchMock.mockResolvedValue(
        upstream('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', {
          headers: { "content-type": "image/svg+xml" },
        }),
      );
      const res = await get(GOOGLE);
      expect(res.status).toBe(415);
      expect(res.headers.get("content-type")).not.toMatch(/svg/);
      expect(await res.text()).not.toContain("<script>");
    });

    it.each(["text/html", "application/json", "application/octet-stream", "image/x-icon", ""])(
      "refuses upstream content type %p",
      async (type) => {
        fetchMock.mockResolvedValue(upstream("<html></html>", { headers: { "content-type": type } }));
        const res = await get(GOOGLE);
        expect(res.status).toBe(415);
      },
    );

    it("does not cache its own errors", async () => {
      const res = await get("https://example.com/a.jpg");
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("size cap", () => {
    it("refuses an upstream that declares more than 5 MB without reading it", async () => {
      const state = { cancelled: false, pulled: 0 };
      fetchMock.mockResolvedValue(
        upstream(chunkedBody(MAX_BYTES * 4, state), { headers: { "content-length": String(MAX_BYTES + 1) } }),
      );
      const res = await get(GOOGLE);
      expect(res.status).toBe(413);
      expect(state.pulled).toBeLessThanOrEqual(64 * 1024 * 2);
    });

    it("stops reading a body that is bigger than it said, and cancels the stream", async () => {
      const state = { cancelled: false, pulled: 0 };
      fetchMock.mockResolvedValue(upstream(chunkedBody(MAX_BYTES * 10, state), { headers: { "content-length": "1000" } }));
      const res = await get(GOOGLE);
      expect(res.status).toBe(413);
      expect(state.cancelled).toBe(true);
      expect(state.pulled).toBeLessThan(MAX_BYTES + 256 * 1024);
    });

    it("stops reading a body with no Content-Length at all", async () => {
      const state = { cancelled: false, pulled: 0 };
      fetchMock.mockResolvedValue(upstream(chunkedBody(MAX_BYTES * 10, state)));
      const res = await get(GOOGLE);
      expect(res.status).toBe(413);
      expect(state.cancelled).toBe(true);
    });

    it("serves a body of exactly 5 MB", async () => {
      const state = { cancelled: false, pulled: 0 };
      fetchMock.mockResolvedValue(upstream(chunkedBody(MAX_BYTES, state)));
      const res = await get(GOOGLE);
      expect(res.status).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBe(MAX_BYTES);
    });

    it("answers 502 for an empty body", async () => {
      fetchMock.mockResolvedValue(upstream(new Uint8Array(0)));
      const res = await get(GOOGLE);
      expect(res.status).toBe(502);
    });
  });

  describe("rate limit", () => {
    const SITE = { limit: 3000, windowSec: 60, prefix: "proxy-image-site" };
    const CLIENT = { limit: 120, windowSec: 60, prefix: "proxy-image" };

    // getClientIp trusts no client-IP header unless the deployment names one;
    // these tests model a deployment that trusts cf-connecting-ip.
    const originalTrustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
    beforeEach(() => {
      process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
    });
    afterEach(() => {
      if (originalTrustedHeader === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
      else process.env.TRUSTED_CLIENT_IP_HEADER = originalTrustedHeader;
    });

    /** A real counting limiter, keyed like the real one: prefix + key. */
    function useCountingLimiter(): Map<string, number> {
      const counts = new Map<string, number>();
      rateLimitMock.mockImplementation(async (key: string, config: { limit: number; prefix: string }) => {
        const bucket = `${config.prefix}:${key}`;
        const count = (counts.get(bucket) ?? 0) + 1;
        counts.set(bucket, count);
        return { allowed: count <= config.limit, remaining: Math.max(0, config.limit - count), resetAt: Date.now() + 60_000 };
      });
      return counts;
    }

    it("charges a site-wide bucket on every request, then the client's own: 3000 a minute for the site, 120 for each address getClientIp trusts", async () => {
      const res = await get(GOOGLE, { "cf-connecting-ip": "203.0.113.9" });
      expect(res.status).toBe(200);
      expect(rateLimitMock).toHaveBeenCalledTimes(2);
      expect(rateLimitMock).toHaveBeenNthCalledWith(1, "all", SITE);
      expect(rateLimitMock).toHaveBeenNthCalledWith(2, "203.0.113.9", CLIENT);
    });

    it('has no separate bucket for "direct" visitors: the site-wide one already covers them, and a smaller shared one would let one client lock out the rest', async () => {
      const res = await get(GOOGLE);
      expect(res.status).toBe(200);
      expect(rateLimitMock).toHaveBeenCalledTimes(1);
      expect(rateLimitMock).toHaveBeenCalledWith("all", SITE);
      expect(rateLimitMock.mock.calls.some(([, config]) => config.prefix === "proxy-image-global")).toBe(false);
    });

    it("a caller that sends a different forged cf-connecting-ip every time still hits the site-wide cap", async () => {
      const counts = useCountingLimiter();
      fetchMock.mockImplementation(async () => upstream(JPEG));

      let lastAllowed = 0;
      let firstRefused = 0;
      for (let i = 1; i <= SITE.limit + 5; i++) {
        const forged = `198.51.${Math.floor(i / 250)}.${(i % 250) + 1}`;
        const res = await get(GOOGLE, { "cf-connecting-ip": forged });
        if (res.status === 200) lastAllowed = i;
        else if (!firstRefused) firstRefused = i;
        if (res.status === 429) expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      }

      // Every forged address was a fresh per-client bucket that never came near 120 ...
      const perClient = [...counts].filter(([bucket]) => bucket.startsWith("proxy-image:")).map(([, n]) => n);
      expect(Math.max(...perClient)).toBe(1);
      // ... and the shared cap is what stopped the caller.
      expect(lastAllowed).toBe(SITE.limit);
      expect(firstRefused).toBe(SITE.limit + 1);
      expect(fetchMock).toHaveBeenCalledTimes(SITE.limit);
    }, 60_000);

    it("answers 429 with Retry-After and no upstream request when the client's own budget is spent", async () => {
      rateLimitMock.mockImplementation(async (_key: string, config: { prefix: string }) =>
        config.prefix === CLIENT.prefix
          ? { allowed: false, remaining: 0, resetAt: Date.now() + 30_000 }
          : { allowed: true, remaining: 100, resetAt: Date.now() + 60_000 },
      );
      const res = await get(GOOGLE, { "cf-connecting-ip": "203.0.113.9" });
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(fetchMock).not.toHaveBeenCalled();
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/couldn't|try again/i);
    });

    it("answers 429 when the site-wide budget is spent, before any per-client bucket is created", async () => {
      rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
      const res = await get(GOOGLE, { "cf-connecting-ip": "203.0.113.9" });
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(rateLimitMock).toHaveBeenCalledTimes(1);
      expect(rateLimitMock).toHaveBeenCalledWith("all", SITE);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("counts a refused host against the budget too (checked before any parsing work)", async () => {
      rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
      const res = await get("https://example.com/a.jpg", { "cf-connecting-ip": "203.0.113.9" });
      expect(res.status).toBe(429);
    });

    it("charges a refused host to the site bucket and the client's bucket", async () => {
      const res = await get("https://example.com/a.jpg", { "cf-connecting-ip": "203.0.113.9" });
      expect(res.status).toBe(403);
      expect(rateLimitMock).toHaveBeenCalledWith("all", SITE);
      expect(rateLimitMock).toHaveBeenCalledWith("203.0.113.9", CLIENT);
    });
  });

  describe("upstream concurrency", () => {
    const MAX_IN_FLIGHT = 20;

    async function until(condition: () => boolean): Promise<void> {
      for (let i = 0; i < 200 && !condition(); i++) await new Promise((resolve) => setImmediate(resolve));
      expect(condition()).toBe(true);
    }

    it(`answers 503 with Retry-After once ${MAX_IN_FLIGHT} upstream fetches are in flight, and recovers when they finish`, async () => {
      const release: Array<() => void> = [];
      fetchMock.mockImplementation(() => new Promise<Response>((resolve) => release.push(() => resolve(upstream(JPEG)))));

      const inFlight = Array.from({ length: MAX_IN_FLIGHT }, () => get(GOOGLE));
      await until(() => fetchMock.mock.calls.length === MAX_IN_FLIGHT);

      const refused = await get(GOOGLE);
      expect(refused.status).toBe(503);
      expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(refused.headers.get("cache-control")).toBe("no-store");
      const body = (await refused.json()) as { error: string };
      expect(body.error).toMatch(/couldn't load that image right now/i);
      expect(fetchMock).toHaveBeenCalledTimes(MAX_IN_FLIGHT);

      release.forEach((done) => done());
      const finished = await Promise.all(inFlight);
      expect(finished.map((r) => r.status)).toEqual(Array(MAX_IN_FLIGHT).fill(200));

      fetchMock.mockImplementation(async () => upstream(JPEG));
      expect((await get(GOOGLE)).status).toBe(200);
    });

    it("gives the slot back when the upstream throws, times out, refuses or sends something that is not an image", async () => {
      const failures: Array<() => Promise<Response>> = [
        async () => {
          throw new Error("socket hang up");
        },
        async () => {
          throw new DOMException("The operation timed out", "TimeoutError");
        },
        async () => new Response("no", { status: 403 }),
        async () => upstream("<html></html>", { headers: { "content-type": "text/html" } }),
      ];
      for (let i = 0; i < MAX_IN_FLIGHT * 3; i++) {
        fetchMock.mockImplementationOnce(failures[i % failures.length]);
        expect([502, 415]).toContain((await get(GOOGLE)).status);
      }
      fetchMock.mockImplementation(async () => upstream(JPEG));
      expect((await get(GOOGLE)).status).toBe(200);
    });

    it("does not use a slot for a request that is refused before it reaches the upstream", async () => {
      for (let i = 0; i < MAX_IN_FLIGHT * 2; i++) expect((await get("https://example.com/a.jpg")).status).toBe(403);
      expect((await get(GOOGLE)).status).toBe(200);
    });

    describe("the slot is taken before the DNS check, so an over-bound request is shed without any lookup", () => {
      it("answers 503 without calling assertPublicUrl once the slots are all held (here: held while still in the DNS check)", async () => {
        const releaseDns: Array<() => void> = [];
        // A fresh Response per fetch: a body can be read once.
        fetchMock.mockImplementation(async () => upstream(JPEG));
        // The first MAX_IN_FLIGHT lookups hang; any later one answers at once.
        assertPublicUrlMock.mockImplementation(() => {
          if (assertPublicUrlMock.mock.calls.length <= MAX_IN_FLIGHT) {
            return new Promise<void>((resolve) => releaseDns.push(resolve));
          }
          return Promise.resolve();
        });

        const held = Array.from({ length: MAX_IN_FLIGHT }, () => get(GOOGLE));
        await until(() => assertPublicUrlMock.mock.calls.length === MAX_IN_FLIGHT);
        expect(fetchMock).not.toHaveBeenCalled();

        const refused = await get(GOOGLE);
        expect(refused.status).toBe(503);
        expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
        expect(refused.headers.get("cache-control")).toBe("no-store");
        // shed before any DNS work: still only the lookups of the requests that hold a slot
        expect(assertPublicUrlMock).toHaveBeenCalledTimes(MAX_IN_FLIGHT);
        expect(fetchMock).not.toHaveBeenCalled();

        releaseDns.forEach((done) => done());
        const finished = await Promise.all(held);
        expect(finished.map((r) => r.status)).toEqual(Array(MAX_IN_FLIGHT).fill(200));

        // all slots came back
        expect((await get(GOOGLE)).status).toBe(200);
      });

      it("answers 503 without calling assertPublicUrl while the slots are held by upstream fetches too", async () => {
        const release: Array<() => void> = [];
        fetchMock.mockImplementation(() => new Promise<Response>((resolve) => release.push(() => resolve(upstream(JPEG)))));
        const held = Array.from({ length: MAX_IN_FLIGHT }, () => get(GOOGLE));
        await until(() => fetchMock.mock.calls.length === MAX_IN_FLIGHT);
        assertPublicUrlMock.mockClear();

        expect((await get(GOOGLE)).status).toBe(503);
        expect(assertPublicUrlMock).not.toHaveBeenCalled();

        release.forEach((done) => done());
        await Promise.all(held);
      });

      it("still refuses a bad host with 403 and no slot, whatever the load: nothing to look up", async () => {
        const releaseDns: Array<() => void> = [];
        fetchMock.mockImplementation(async () => upstream(JPEG));
        assertPublicUrlMock.mockImplementation(() => new Promise<void>((resolve) => releaseDns.push(resolve)));
        const held = Array.from({ length: MAX_IN_FLIGHT }, () => get(GOOGLE));
        await until(() => releaseDns.length === MAX_IN_FLIGHT);

        expect((await get("https://example.com/a.jpg")).status).toBe(403);
        expect((await get("http://lh3.googleusercontent.com/a")).status).toBe(400);
        expect(assertPublicUrlMock).toHaveBeenCalledTimes(MAX_IN_FLIGHT);

        assertPublicUrlMock.mockResolvedValue(undefined);
        releaseDns.forEach((done) => done());
        expect((await Promise.all(held)).map((r) => r.status)).toEqual(Array(MAX_IN_FLIGHT).fill(200));
      });

      it("gives the slot back when the DNS check refuses or throws, so it cannot leak", async () => {
        const refusals: Array<() => Promise<void>> = [
          async () => {
            throw new Error("blocked: private address");
          },
          () => {
            throw new Error("synchronous throw from the resolver");
          },
          () => Promise.reject(new Error("ENOTFOUND")),
        ];
        for (let i = 0; i < MAX_IN_FLIGHT * 3; i++) {
          assertPublicUrlMock.mockImplementationOnce(refusals[i % refusals.length]);
          expect((await get(GOOGLE)).status).toBe(403);
        }
        expect(fetchMock).not.toHaveBeenCalled();
        // 60 refusals later the 20 slots are all still there: 20 held requests fit, and the 21st is the one refused
        const release: Array<() => void> = [];
        fetchMock.mockImplementation(() => new Promise<Response>((resolve) => release.push(() => resolve(upstream(JPEG)))));
        const held = Array.from({ length: MAX_IN_FLIGHT }, () => get(GOOGLE));
        await until(() => fetchMock.mock.calls.length === MAX_IN_FLIGHT);
        expect((await get(GOOGLE)).status).toBe(503);
        release.forEach((done) => done());
        expect((await Promise.all(held)).map((r) => r.status)).toEqual(Array(MAX_IN_FLIGHT).fill(200));
      });
    });
  });

  describe("upstream failures are logged", () => {
    function logged(): string {
      return JSON.stringify(warnMock.mock.calls);
    }

    it("names the provider host and the error, never the address", async () => {
      fetchMock.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
      const res = await get(LINKEDIN);
      expect(res.status).toBe(502);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(logged()).toContain("media.licdn.com");
      expect(logged()).toContain("TimeoutError");
      for (const secret of ["profile-displayphoto", "sig", "e=1", "https://"]) expect(logged()).not.toContain(secret);
    });

    it("names the host and the status when the provider answers with an error", async () => {
      fetchMock.mockResolvedValue(new Response("deny", { status: 403 }));
      expect((await get(GOOGLE)).status).toBe(502);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(logged()).toContain("lh3.googleusercontent.com");
      expect(logged()).toContain("403");
      for (const secret of ["ACg8ocJxyz", "s96-c", "https://"]) expect(logged()).not.toContain(secret);
    });

    it("logs a body that is too large, empty, or not an image, without the address", async () => {
      fetchMock.mockImplementationOnce(async () => upstream(JPEG, { headers: { "content-length": String(MAX_BYTES + 1) } }));
      fetchMock.mockImplementationOnce(async () => upstream(new Uint8Array(0)));
      fetchMock.mockImplementationOnce(async () => upstream("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
      const statuses = [(await get(GOOGLE)).status, (await get(GOOGLE)).status, (await get(GOOGLE)).status];
      expect(statuses).toEqual([413, 502, 415]);
      expect(warnMock).toHaveBeenCalledTimes(3);
      expect(logged()).not.toContain("ACg8ocJxyz");
      expect(logged()).not.toContain("https://");
    });

    it("stays quiet for a served photo and for a request refused before it reaches the provider", async () => {
      expect((await get(GOOGLE)).status).toBe(200);
      expect((await get("https://example.com/a.jpg")).status).toBe(403);
      expect((await get()).status).toBe(400);
      expect(warnMock).not.toHaveBeenCalled();
    });
  });
});
