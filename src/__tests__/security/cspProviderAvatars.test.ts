/**
 * @jest-environment node
 */
import { SECURITY_HEADERS, getSecurityHeaders } from "@/lib/security/headers";

/** The value of one directive from a CSP string, or "" when it is absent. */
function directive(csp: string, name: string): string {
  const found = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return found ?? "";
}

const PROVIDER_HOSTS = ["lh3.googleusercontent.com", "googleusercontent.com", "media.licdn.com", "licdn.com"];

describe("CSP img-src after provider avatars moved behind our own proxy", () => {
  const policies: Array<[string, string]> = [
    ["page CSP", getSecurityHeaders("nonce123")["Content-Security-Policy"]],
    ["API CSP", SECURITY_HEADERS["Content-Security-Policy"]],
  ];

  it.each(policies)("%s no longer lets the browser load images from Google or LinkedIn", (_name, csp) => {
    const imgSrc = directive(csp, "img-src");
    expect(imgSrc).not.toBe("");
    for (const host of PROVIDER_HOSTS) expect(imgSrc).not.toContain(host);
  });

  it.each(policies)("%s still allows our own origin, data:, blob: and our storage", (_name, csp) => {
    const imgSrc = directive(csp, "img-src");
    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("blob:");
    expect(imgSrc).toContain("https://*.digitaloceanspaces.com");
    expect(imgSrc).toContain("https://*.cdn.digitaloceanspaces.com");
  });

  it.each(policies)("%s does not touch connect-src or frame-src for this change", (_name, csp) => {
    expect(directive(csp, "connect-src")).toContain("https://*.digitaloceanspaces.com");
    expect(directive(csp, "frame-src")).toContain("https://accounts.google.com");
  });
});
