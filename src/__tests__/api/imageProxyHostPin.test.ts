/**
 * @jest-environment node
 *
 * /api/image-proxy (poster export) fetches an image server-side and serves it
 * same-origin. It accepted ANY *.digitaloceanspaces.com bucket when
 * SPACES_PUBLIC_HOST was unset: a relay for other people's buckets. It is now
 * pinned to our own bucket and CDN hosts, as toPublicImageSrc is.
 */
import { NextRequest } from "next/server";

const env = process.env as Record<string, string | undefined>;
const KEYS = ["SPACES_BUCKET_NAME", "DO_SPACES_BUCKET", "SPACES_ENDPOINT", "DO_SPACES_CDN_ENDPOINT", "SPACES_PUBLIC_HOST", "NEXT_PUBLIC_SPACES_PUBLIC_HOST"] as const;
const saved: Record<string, string | undefined> = {};

const fetchMock = jest.fn();

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = env[key];
    delete env[key];
  }
  env.SPACES_BUCKET_NAME = "our-bucket";
  env.SPACES_ENDPOINT = "blr1.digitaloceanspaces.com";
  fetchMock.mockReset().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

const get = async (target: string) => {
  const { GET } = await import("@/app/api/image-proxy/route");
  return GET(new NextRequest(`http://localhost/api/image-proxy?url=${encodeURIComponent(target)}`));
};

describe("/api/image-proxy: which hosts it fetches", () => {
  it("fetches from our own bucket", async () => {
    const res = await get("https://our-bucket.blr1.digitaloceanspaces.com/posters/a.png");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses another account's bucket on the same Spaces region, without fetching", async () => {
    const res = await get("https://someone-else.blr1.digitaloceanspaces.com/a.png");
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches from our CDN host when one is configured", async () => {
    env.DO_SPACES_CDN_ENDPOINT = "https://our-bucket.blr1.cdn.digitaloceanspaces.com";
    expect((await get("https://our-bucket.blr1.cdn.digitaloceanspaces.com/a.png")).status).toBe(200);
  });

  it("takes the pinned public host(s) when set, a comma list included, and nothing else", async () => {
    env.NEXT_PUBLIC_SPACES_PUBLIC_HOST = "media.example.com, our-bucket.blr1.cdn.digitaloceanspaces.com";
    expect((await get("https://media.example.com/a.png")).status).toBe(200);
    expect((await get("https://our-bucket.blr1.cdn.digitaloceanspaces.com/a.png")).status).toBe(200);
    expect((await get("https://our-bucket.blr1.digitaloceanspaces.com/a.png")).status).toBe(403);
  });

  it.each([
    ["a port", "https://our-bucket.blr1.digitaloceanspaces.com:8443/a.png"],
    ["credentials", "https://user:pw@our-bucket.blr1.digitaloceanspaces.com/a.png"],
    ["plain http", "http://our-bucket.blr1.digitaloceanspaces.com/a.png"],
  ])("refuses a URL with %s", async (_label, target) => {
    expect((await get(target)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
