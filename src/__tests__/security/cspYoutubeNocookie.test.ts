/**
 * @jest-environment node
 *
 * Videos are click-to-load and come from the privacy-enhanced host, so the page
 * CSP frames youtube-nocookie.com and nothing else from YouTube. Hosts no client
 * code calls any more (Google Fonts, Pusher, the AI providers) are gone too: a
 * CSP that lists hosts nobody uses is a standing invitation to use them.
 */
import { SECURITY_HEADERS, getSecurityHeaders } from "@/lib/security/headers";

function directive(csp: string, name: string): string {
  return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";
}

function sources(csp: string, name: string): string[] {
  return directive(csp, name).split(/\s+/).slice(1);
}

const REMOVED_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "pusher.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
];

const policies: Array<[string, string]> = [
  ["page CSP", getSecurityHeaders("nonce123")["Content-Security-Policy"]],
  ["API CSP", SECURITY_HEADERS["Content-Security-Policy"]],
];

describe("frame-src and YouTube", () => {
  it("lets the page frame youtube-nocookie.com and not www.youtube.com", () => {
    const frameSrc = sources(getSecurityHeaders("n")["Content-Security-Policy"], "frame-src");
    expect(frameSrc).toContain("https://www.youtube-nocookie.com");
    expect(frameSrc).not.toContain("https://www.youtube.com");
    expect(frameSrc.some((source) => /(^|[/.*])youtube\.com/.test(source))).toBe(false);
  });

  it.each(policies)("%s never frames Vimeo", (_name, csp) => {
    expect(csp).not.toMatch(/vimeo/i);
  });

  it("keeps the frames the sign-in and spam-protection flows need", () => {
    const frameSrc = sources(getSecurityHeaders("n")["Content-Security-Policy"], "frame-src");
    expect(frameSrc).toEqual(
      expect.arrayContaining([
        "'self'",
        "blob:",
        "https://*.firebaseapp.com",
        "https://accounts.google.com",
        "https://www.google.com/recaptcha/",
        "https://*.digitaloceanspaces.com",
        "https://*.cdn.digitaloceanspaces.com",
      ]),
    );
  });

  it("frames reCAPTCHA from both hosts Google's CSP guidance lists, each limited to /recaptcha/", () => {
    const frameSrc = sources(getSecurityHeaders("n")["Content-Security-Policy"], "frame-src");
    expect(frameSrc).toEqual(expect.arrayContaining(["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"]));
    expect(frameSrc).not.toContain("https://recaptcha.google.com");
    expect(frameSrc.filter((source) => source.includes("recaptcha.google.com"))).toEqual(["https://recaptcha.google.com/recaptcha/"]);
  });

  it("keeps the API CSP's frames as they were", () => {
    const frameSrc = sources(SECURITY_HEADERS["Content-Security-Policy"], "frame-src");
    expect(frameSrc).toEqual([
      "'self'",
      "https://*.firebaseapp.com",
      "https://accounts.google.com",
      "https://*.digitaloceanspaces.com",
      "https://*.cdn.digitaloceanspaces.com",
    ]);
  });
});

describe("hosts with no client caller", () => {
  it.each(policies)("%s no longer lists them anywhere", (_name, csp) => {
    for (const host of REMOVED_HOSTS) expect(csp).not.toContain(host);
    expect(csp).not.toMatch(/wss:/);
  });

  it("drops them in development too, where the policy is built differently", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "development");
    try {
      const csp = getSecurityHeaders("n")["Content-Security-Policy"];
      for (const host of REMOVED_HOSTS) expect(csp).not.toContain(host);
      expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("serves fonts and styles from our own origin", () => {
    const csp = getSecurityHeaders("nonce123")["Content-Security-Policy"];
    expect(sources(csp, "font-src")).toEqual(["'self'", "data:"]);
    expect(sources(csp, "style-src-elem").filter((source) => source.startsWith("https:"))).toEqual([]);
  });
});

describe("what stays in connect-src", () => {
  it.each(policies)("%s still allows storage, Firebase sign-in and our own origin", (_name, csp) => {
    const connectSrc = sources(csp, "connect-src");
    expect(connectSrc).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://*.digitaloceanspaces.com",
        "https://*.cdn.digitaloceanspaces.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
      ]),
    );
  });

  it.each(policies)("%s no longer allows Firebase Realtime Database (no client imports firebase/database)", (_name, csp) => {
    expect(csp).not.toContain("firebaseio");
  });

  it("keeps reCAPTCHA's connection on the page policy, limited to its path", () => {
    const connectSrc = sources(getSecurityHeaders("n")["Content-Security-Policy"], "connect-src");
    expect(connectSrc).toContain("https://www.google.com/recaptcha/");
    expect(connectSrc).not.toContain("https://www.google.com");
  });

  it("lists Google's reCAPTCHA hosts only under /recaptcha/, in every directive and in development", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "development");
    try {
      for (const csp of [getSecurityHeaders("n")["Content-Security-Policy"]]) {
        expect(csp).not.toMatch(/https:\/\/www\.(google|gstatic)\.com(?!\/recaptcha\/)/);
        expect(directive(csp, "script-src")).toContain("https://www.gstatic.com/recaptcha/");
      }
    } finally {
      jest.restoreAllMocks();
    }
    expect(getSecurityHeaders("n")["Content-Security-Policy"]).not.toMatch(/https:\/\/www\.(google|gstatic)\.com(?!\/recaptcha\/)/);
  });
});
