import { getClientIp } from "@/lib/security/clientIp";

/** SEC-C6: without a trusted proxy, one client must not share a key with everyone. */
describe("getClientIp without trusted proxy config", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.TRUSTED_PROXY_HOPS;
    delete process.env.TRUST_CLOUDFLARE;
  });
  afterAll(() => {
    process.env = saved;
  });

  it("ignores cf-connecting-ip unless TRUST_CLOUDFLARE=1", () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.9" });
    expect(getClientIp(headers)).toBe("direct");
    process.env.TRUST_CLOUDFLARE = "1";
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then a per-client bucket", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    const a = getClientIp(new Headers({ "user-agent": "UA-1", "accept-language": "en" }));
    const b = getClientIp(new Headers({ "user-agent": "UA-2", "accept-language": "en" }));
    expect(a).toMatch(/^anon-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(getClientIp(new Headers({ "user-agent": "UA-1", "accept-language": "en" }))).toBe(a);
  });
});
