/**
 * @jest-environment node
 *
 * Every job email's footer linked to `/api/unsubscribe?ref=digest` — no token.
 * The route answers a tokenless request with "Missing unsubscribe token", so
 * the one link a seeker clicks to stop our mail opened an error page, and the
 * only way left to make it stop was "Report spam". The weekly digest was worse:
 * `?token=WEEKLY`, a literal that no secret will ever verify.
 *
 * Naukri, Indeed and LinkedIn all carry a working one-click unsubscribe, and
 * Gmail/Yahoo treat a missing or broken one as a spam signal for the whole
 * sending domain — password resets included. These tests pin the link to one
 * the route actually accepts, and ban the tokenless forms from coming back.
 */
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { unsubscribeUrl, unsubscribeSecret, notificationSettingsPath } from "@/lib/communications/unsubscribeLink";
import { emailFooter } from "@/lib/communications/emailLayout";
import { buildDigestEmail } from "@/lib/inngest/dailyDigestWorker";

const SECRET = "test-unsubscribe-secret";
const ORIGINAL = { jwt: process.env.JWT_SECRET, nextauth: process.env.NEXTAUTH_SECRET };

beforeEach(() => {
  delete process.env.JWT_SECRET;
  process.env.NEXTAUTH_SECRET = SECRET;
});

afterAll(() => {
  if (ORIGINAL.jwt === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL.jwt;
  if (ORIGINAL.nextauth === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL.nextauth;
});

function tokenOf(url: string): string {
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error(`no token in ${url}`);
  return token;
}

describe("unsubscribeUrl", () => {
  it("signs a token the unsubscribe route will verify, scoped to one category", () => {
    const url = unsubscribeUrl("https://x.test", "user-1", { category: "jobs", ref: "digest" });
    expect(url).toMatch(/^https:\/\/x\.test\/api\/unsubscribe\?token=/);
    expect(new URL(url!).searchParams.get("ref")).toBe("digest");

    const payload = jwt.verify(tokenOf(url!), SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
    expect(payload).toMatchObject({ userId: "user-1", action: "unsubscribe", category: "jobs" });
  });

  it("omits the category when none is given, which the route reads as 'all emails'", () => {
    const payload = jwt.decode(tokenOf(unsubscribeUrl("https://x.test", "user-1")!)) as Record<string, unknown>;
    expect(payload.category).toBeUndefined();
  });

  it("uses the same secret precedence as the route: JWT_SECRET first", () => {
    process.env.JWT_SECRET = "route-prefers-this";
    expect(unsubscribeSecret()).toBe("route-prefers-this");
    const url = unsubscribeUrl("https://x.test", "user-1")!;
    expect(() => jwt.verify(tokenOf(url), "route-prefers-this", { algorithms: ["HS256"] })).not.toThrow();
  });

  it("returns null rather than a link that cannot work", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(unsubscribeUrl("https://x.test", "user-1")).toBeNull();
    process.env.NEXTAUTH_SECRET = SECRET;
    expect(unsubscribeUrl("https://x.test", "")).toBeNull();
  });
});

describe("emailFooter unsubscribe link", () => {
  it("links to a signed, category-scoped unsubscribe when it knows the recipient", () => {
    const html = emailFooter({
      locale: "en",
      baseUrl: "https://x.test",
      reason: "r",
      unsubRef: "digest",
      userId: "user-9",
      unsubCategory: "jobs",
    });
    const href = html.match(/href="(https:\/\/x\.test\/api\/unsubscribe[^"]*)"/)?.[1];
    expect(href).toBeDefined();
    const payload = jwt.verify(tokenOf(href!.replace(/&amp;/g, "&")), SECRET) as Record<string, unknown>;
    expect(payload).toMatchObject({ userId: "user-9", category: "jobs" });
  });

  it("drops the unsubscribe link, never a dead one, when it cannot sign", () => {
    const html = emailFooter({ locale: "en", baseUrl: "https://x.test", reason: "r", unsubRef: "digest" });
    expect(html).not.toContain("/api/unsubscribe");
    // Manage preferences still works without a token — the seeker is not stranded.
    expect(html).toContain("https://x.test/en/job-seeker/settings/notifications");
  });
});

describe("digest email carries a working unsubscribe", () => {
  it("scopes the digest footer link to job emails for that seeker", () => {
    const html = buildDigestEmail({
      userId: "seeker-42",
      userName: "Asha",
      locale: "en",
      jobs: [],
      profileViews: { count: 0, viewers: [] },
      profile: { completeness: 80, signals: 4 },
    });
    const href = html.match(/href="([^"]*\/api\/unsubscribe[^"]*)"/)?.[1];
    expect(href).toBeDefined();
    const payload = jwt.verify(tokenOf(href!.replace(/&amp;/g, "&")), SECRET) as Record<string, unknown>;
    expect(payload).toMatchObject({ userId: "seeker-42", category: "jobs" });
  });
});

describe("notificationSettingsPath", () => {
  // Every notification email linked to /en/settings/notifications, which is a
  // 404 for every role. Pin each path to a page that actually exists.
  it.each(["job_seeker", "admin", "employer", "agent", "super_agent", undefined])(
    "points %s at a real page",
    (role) => {
      const route = notificationSettingsPath(role, "en").split("?")[0].replace(/^\/en/, "");
      const candidates = ["(dashboard)", "(public)", "(auth)"].map((group) =>
        path.join(process.cwd(), "src/app/[locale]", group, route, "page.tsx"),
      );
      expect(candidates.some((p) => fs.existsSync(p))).toBe(true);
    },
  );

  it("keeps the recipient's locale", () => {
    expect(notificationSettingsPath("job_seeker", "ar")).toBe("/ar/job-seeker/settings/notifications");
  });
});

describe("guard: no tokenless unsubscribe links in outgoing mail", () => {
  const ROOTS = ["src/lib/inngest", "src/lib/communications", "src/app/api/cron"];

  function sourceFiles(dir: string): string[] {
    const abs = path.join(process.cwd(), dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(rel);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : [];
    });
  }

  it("never links to /api/unsubscribe with only a ref or a placeholder token", () => {
    const offenders = sourceFiles(ROOTS[0])
      .concat(sourceFiles(ROOTS[1]), sourceFiles(ROOTS[2]))
      .filter((file) => {
        // Comments may quote the old URLs to explain them; only code counts.
        // Line comments are stripped only at line start, so the `//` inside an
        // "https://…" literal cannot hide an offender on the same line.
        const src = fs
          .readFileSync(path.join(process.cwd(), file), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return /\/api\/unsubscribe\?ref=/.test(src) || /\/api\/unsubscribe\?token=[A-Z]+["`]/.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
