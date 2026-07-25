import { getClientIp } from "@/lib/security/clientIp";
import { escapeHtml, sanitizeEmailSubject } from "@/lib/security/html-escape";
import { serializeJsonLd } from "@/lib/security/jsonLd";
import { isLinkedInProfileUrl } from "@/lib/security/linkedin-url";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";

describe("security remediations", () => {
  const originalVercel = process.env.VERCEL;
  const originalTrustedProxyHops = process.env.TRUSTED_PROXY_HOPS;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalTrustedProxyHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = originalTrustedProxyHops;
  });

  test("ignores spoofed proxy headers by default", () => {
    delete process.env.VERCEL;
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.50" }))).toBe("direct");
  });

  test("uses the right-most untrusted address behind an explicitly trusted proxy", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(
      getClientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.12" })),
    ).toBe("203.0.113.12");
  });

  test("validates IPv4 and IPv6 proxy values without Node-only APIs", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(getClientIp(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(getClientIp(new Headers({ "x-forwarded-for": "999.1.1.1" }))).toBe("direct");
    expect(getClientIp(new Headers({ "x-forwarded-for": "2001:db8::1::2" }))).toBe("direct");
  });

  test("restricts LinkedIn imports to canonical profile URLs", () => {
    expect(isLinkedInProfileUrl("https://www.linkedin.com/in/example-user")).toBe(true);
    expect(isLinkedInProfileUrl("http://www.linkedin.com/in/example-user")).toBe(false);
    expect(isLinkedInProfileUrl("https://linkedin.com.evil.example/in/example-user")).toBe(false);
    expect(isLinkedInProfileUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  test("escapes inline JSON and email fields", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(sanitizeEmailSubject("Safe\r\nBcc: attacker@example.com")).toBe(
      "Safe Bcc: attacker@example.com",
    );
  });

  test("enforces one password policy for account-changing operations", () => {
    expect(strongPasswordSchema.safeParse("Admin@1234").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Longer#Secure2026").success).toBe(true);
  });
});
