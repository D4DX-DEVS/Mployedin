/**
 * A live audit on a production build found that Serwist's `defaultCache`
 * stored every same-origin GET /api/* reply and every dashboard page / RSC
 * payload for 24 hours. After an admin signed out, the cached
 * /api/admin/users, /api/job-seekers and /api/admin/gdpr replies (with email
 * addresses) were still readable offline, and the admin dashboard still
 * rendered. These tests hold the replacement rules: personal data is never
 * cached, only hashed build assets and static art are.
 */
jest.mock("serwist", () => {
  class NetworkOnly {
    constructor(public options?: unknown) {}
  }
  class CacheFirst {
    constructor(public options?: { cacheName?: string; plugins?: unknown[] }) {}
  }
  class ExpirationPlugin {
    constructor(public config: { maxEntries?: number; maxAgeSeconds?: number }) {}
  }
  return { NetworkOnly, CacheFirst, ExpirationPlugin };
});

import { CacheFirst, NetworkOnly } from "serwist";
import { LEGACY_RUNTIME_CACHES, runtimeCaching } from "@/lib/pwa/runtimeCaching";

const ORIGIN = "https://app.mployedin.test";

interface FakeRequest {
  mode?: string;
  destination?: string;
  headers?: Record<string, string>;
  method?: string;
}

type Matcher = (options: unknown) => unknown;

/** The first rule whose matcher accepts the request, like Serwist's router. */
function firstMatch(href: string, init: FakeRequest = {}) {
  const url = new URL(href, ORIGIN);
  const headers = init.headers ?? {};
  const request = {
    url: url.href,
    method: init.method ?? "GET",
    mode: init.mode ?? "cors",
    destination: init.destination ?? "",
    headers: { get: (name: string) => headers[name] ?? null },
  };
  const options = { request, url, sameOrigin: url.origin === ORIGIN, event: {} };
  return runtimeCaching.find((rule) => (rule.matcher as Matcher)(options));
}

const handlerOf = (href: string, init?: FakeRequest) => firstMatch(href, init)?.handler;

interface CacheFirstShape {
  options: {
    cacheName?: string;
    plugins?: { config: { maxAgeSeconds?: number; maxEntries?: number } }[];
  };
}

describe("runtimeCaching: personal data is never cached", () => {
  it("keeps the auth handshake rule first", () => {
    expect(handlerOf("https://mployedin-d3d2a.firebaseapp.com/__/auth/iframe")).toBeInstanceOf(NetworkOnly);
    const url = new URL("https://accounts.google.com/o/oauth2/auth");
    expect((runtimeCaching[0].matcher as Matcher)({ url, sameOrigin: false, request: {}, event: {} })).toBe(true);
    expect(runtimeCaching[0].handler).toBeInstanceOf(NetworkOnly);
  });

  it.each([
    "/api/admin/users?page=1",
    "/api/job-seekers",
    "/api/admin/gdpr",
    "/api/auth/session",
    "/api/push/subscription",
  ])("goes to the network for same-origin %s", (path) => {
    expect(handlerOf(path)).toBeInstanceOf(NetworkOnly);
  });

  it("goes to the network for an /api path that looks like a static file", () => {
    expect(handlerOf("/api/export/users.json")).toBeInstanceOf(NetworkOnly);
    expect(handlerOf("/api/files/cv.png")).toBeInstanceOf(NetworkOnly);
  });

  it("goes to the network for an image the optimizer would fetch from /api", () => {
    expect(handlerOf("/_next/image?url=%2Fapi%2Ffiles%2Fphoto.png&w=64&q=75")).toBeInstanceOf(NetworkOnly);
  });

  // Candidate photos and logos must not persist on the device: only the site's
  // own public art may be cached through the optimizer.
  it.each([
    ["Google avatar", "https://lh3.googleusercontent.com/a/photo=s96"],
    ["LinkedIn photo", "https://media.licdn.com/dms/image/abc"],
    ["Cloudinary upload", "https://res.cloudinary.com/demo/image/upload/a.png"],
    ["Spaces upload", "https://bucket.fra1.digitaloceanspaces.com/cv/photo.jpg"],
  ])("goes to the network for an optimized remote image (%s)", (_label, remote) => {
    expect(handlerOf(`/_next/image?url=${encodeURIComponent(remote)}&w=96&q=75`)).toBeInstanceOf(NetworkOnly);
  });

  it.each([
    ["a protocol-relative URL", "//evil.test/photo.png"],
    ["a backslash path", "/\\evil.test/photo.png"],
    ["an /api look-alike prefix", "/apiary/photo.png"],
    ["a missing url", ""],
  ])("goes to the network for an optimized image from %s", (_label, source) => {
    const query = source ? `url=${encodeURIComponent(source)}&w=96&q=75` : "w=96&q=75";
    expect(handlerOf(`/_next/image?${query}`)).toBeInstanceOf(NetworkOnly);
  });

  it.each([
    ["a navigation request", { mode: "navigate", destination: "document" }],
    ["a document-destination request", { destination: "document" }],
  ])("goes to the network for %s", (_label, init) => {
    expect(handlerOf("/en/admin/users", init)).toBeInstanceOf(NetworkOnly);
  });

  it("goes to the network for a navigation to a path that ends like a static file", () => {
    expect(handlerOf("/en/jobs/export.json", { mode: "navigate" })).toBeInstanceOf(NetworkOnly);
  });

  it("goes to the network for an RSC payload requested with a ?_rsc= param", () => {
    expect(handlerOf("/en/admin/users?_rsc=1abcd")).toBeInstanceOf(NetworkOnly);
  });

  it("goes to the network for an RSC payload requested with the RSC header", () => {
    expect(handlerOf("/en/admin/users", { headers: { RSC: "1" } })).toBeInstanceOf(NetworkOnly);
    expect(handlerOf("/en/admin/users", { headers: { RSC: "1", "Next-Router-Prefetch": "1" } })).toBeInstanceOf(
      NetworkOnly,
    );
  });

  it.each([
    "https://fonts.gstatic.com/s/inter/v13/a.woff2",
    "https://res.cloudinary.com/demo/image/upload/a.png",
    "https://lh3.googleusercontent.com/a/photo=s96",
    "https://example.com/data.json",
  ])("goes to the network for the cross-origin request %s", (href) => {
    expect(handlerOf(href)).toBeInstanceOf(NetworkOnly);
  });
});

describe("runtimeCaching: only build assets and static art are cached", () => {
  it.each([
    "/_next/static/chunks/main-abc123.js",
    "/_next/static/css/app.css",
    "/_next/static/media/inter.woff2",
    "/_next/image?url=%2Flogo.png&w=96&q=75",
    "/icons/icon-192x192.png",
    "/fonts/Manrope-Variable.woff2",
    "/some/dir/Cairo.ttf",
  ])("serves %s cache-first", (path) => {
    expect(handlerOf(path)).toBeInstanceOf(CacheFirst);
  });

  it("serves an optimized local /icons image cache-first", () => {
    expect(handlerOf("/_next/image?url=%2Ficons%2Ficon-96x96.png&w=96&q=75")).toBeInstanceOf(CacheFirst);
  });

  it("gives every cache-first rule a named cache and an expiry", () => {
    const cacheFirst = runtimeCaching.filter((rule) => rule.handler instanceof CacheFirst);
    expect(cacheFirst.length).toBeGreaterThanOrEqual(4);
    for (const rule of cacheFirst) {
      const { options } = rule.handler as unknown as CacheFirstShape;
      expect(options.cacheName).toMatch(/^serwist-/);
      expect(options.plugins).toHaveLength(1);
      expect(options.plugins?.[0].config.maxAgeSeconds).toBeGreaterThan(0);
      expect(options.plugins?.[0].config.maxEntries).toBeGreaterThan(0);
    }
  });

  it("never reuses a legacy cache name for the new rules", () => {
    for (const rule of runtimeCaching) {
      const name = (rule.handler as unknown as Partial<CacheFirstShape>).options?.cacheName;
      if (name) expect(LEGACY_RUNTIME_CACHES).not.toContain(name);
    }
  });

  it("leaves every other same-origin request to the browser", () => {
    // No rule matches: the worker does not touch it and nothing is stored.
    expect(firstMatch("/manifest.json")).toBeUndefined();
    expect(firstMatch("/en/jobs/some-slug")).toBeUndefined();
  });

  it("keeps every cache-first rule on GET", () => {
    const cacheFirst = runtimeCaching.filter((rule) => rule.handler instanceof CacheFirst);
    for (const rule of cacheFirst) {
      expect(rule.method === undefined || rule.method === "GET").toBe(true);
    }
  });
});

describe("LEGACY_RUNTIME_CACHES", () => {
  it("names every runtime cache the old defaultCache wrote personal data to", () => {
    expect([...LEGACY_RUNTIME_CACHES]).toEqual([
      "apis",
      "pages",
      "pages-rsc",
      "pages-rsc-prefetch",
      "others",
      "cross-origin",
      "next-data",
      "static-data-assets",
    ]);
  });
});
