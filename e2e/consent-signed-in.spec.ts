import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { inventory, violations } from "./support/inventory";
import { DESKTOP, EN, IPHONE, banner, bannerButton, newVisitor, settle } from "./support/consentPage";
import type { Profile, Visitor } from "./support/consentPage";

/**
 * Signed in, after "Reject all": each role's main pages hold only necessary
 * storage (the auth cookies are necessary rows) and contact no third party;
 * the banner sits clear of a dashboard's bottom nav on a phone; plus a
 * read-only regression of the essential flows.
 *
 * Production build, like e2e/cookie-consent.spec.ts (build with
 * `node scripts/e2e-prod-build.mjs`, which keeps tsconfig.json and next-env.d.ts
 * byte-identical; then `NEXT_DIST_DIR=.next-e2e npx next start -p 3890`):
 *   E2E_BASE_URL=http://localhost:3890 npx playwright test e2e/consent-signed-in.spec.ts --project desktop-chromium
 *
 * Opt-in: runs only with E2E_SIGNED_IN=1 (about 13 sign-ins write login
 * records to the shared staging database), otherwise every test is skipped.
 *
 * Gate: the shared staging database can be over quota, and then every sign-in
 * fails ("We couldn't reach the sign-in service"), or an account's password may
 * be wrong. The spec probes each role's sign-in once, caches the result, and
 * skips that role with the reason when it failed. A failing account is never
 * tried again in the run, so a failing run cannot lock a shared account.
 *
 * What a run still writes to the shared database: each sign-in records the
 * login (lastLogin, an ActivityLog "login.success"). Nothing else: the
 * recommendation and AI endpoints a dashboard calls on load (they can upsert
 * skill vectors and spend paid embedding calls) are answered in the browser,
 * as are the consent receipt and the language PATCH. No job is applied to, no
 * file uploaded, no form saved; those two essential flows are test.fixme until
 * a throwaway database exists.
 * Accounts: the seeded e2e accounts; override with E2E_<ROLE>_EMAIL / _PASSWORD.
 */

interface Role {
  key: string;
  email: string;
  password: string;
  home: RegExp;
  pages: string[];
}

function role(key: string, email: string, password: string, home: RegExp, pages: string[]): Role {
  const env = key.toUpperCase().replace(/-/g, "_");
  return {
    key,
    email: process.env[`E2E_${env}_EMAIL`] ?? email,
    password: process.env[`E2E_${env}_PASSWORD`] ?? password,
    home,
    pages,
  };
}

const ROLES: Role[] = [
  role("seeker", "jobseeker@mployedin.com", "JobSeeker@1234", /\/job-seeker/, [
    "/en/job-seeker",
    "/en/job-seeker/applications",
    "/en/job-seeker/cv",
    "/en/job-seeker/messages",
    "/en/notifications",
    "/en/job-seeker/settings",
    "/en/job-seeker/settings/privacy",
  ]),
  role("employer", "employer@test.mployedin.com", "TestPass123!", /\/employer/, [
    "/en/employer",
    "/en/employer/jobs",
    "/en/employer/candidates",
    "/en/employer/messages",
    "/en/notifications",
    "/en/employer/settings",
    "/en/employer/privacy",
  ]),
  role("agent", "agent@mployedin.com", "Agent@1234", /\/agent/, [
    "/en/agent",
    "/en/agent/employers",
    "/en/agent/job-seekers",
    "/en/agent/messages",
    "/en/notifications",
    "/en/agent/settings",
    "/en/agent/settings/privacy",
  ]),
  role("super-agent", "superagent@mployedin.com", "SuperAgent@1234", /\/super-agent/, [
    "/en/super-agent",
    "/en/super-agent/agents",
    "/en/super-agent/employers",
    "/en/super-agent/messages",
    "/en/notifications",
    "/en/super-agent/settings",
    "/en/super-agent/settings/privacy",
  ]),
  role("admin", "admin@mployedin.com", "Admin@1234", /\/admin/, [
    "/en/admin",
    "/en/admin/users",
    "/en/admin/messages",
    "/en/notifications",
    "/en/admin/settings",
    "/en/admin/settings/notifications",
    "/en/admin/gdpr",
  ]),
];

/** An employer account that has candidates with a CV (the seeded e2e employer has none). */
const CV_EMPLOYER = role("cv-employer", "employer@mployedin.com", "Employer@1234", /\/employer/, []);

const OPT_IN = process.env.E2E_SIGNED_IN === "1";
let baseURL = "";
/** One sign-in attempt per account per run: null = signed in, else what the page said. */
const probes = new Map<string, string | null>();

/**
 * Endpoints a dashboard calls on load that write (skill vectors) or spend money
 * (embeddings, AI providers): answered here, never reaching the server.
 */
async function stubWritingEndpoints(context: BrowserContext): Promise<void> {
  const empty = { success: true, data: [], jobs: [], items: [], total: 0 };
  for (const pattern of ["**/api/job-seeker/recommended-jobs**", "**/api/jobs/recommended**", "**/api/ai/**"]) {
    await context.route(pattern, (route) => route.fulfill({ status: 200, json: empty }));
  }
}

async function visitor(browser: Browser, profile: Profile = DESKTOP): Promise<Visitor> {
  const v = await newVisitor(browser, profile, baseURL);
  await stubWritingEndpoints(v.context);
  return v;
}

/** Signs in through the form (the recipe that survives the hydration re-render). Returns null on success, else what the page said. */
async function signIn(page: Page, account: Role): Promise<string | null> {
  await page.goto("/en/login", { waitUntil: "load" });
  await page.waitForSelector("#email");
  await page.waitForTimeout(2_500);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  try {
    await page.waitForURL(account.home, { timeout: 30_000 });
    return null;
  } catch {
    const alert = await page.getByRole("alert").allInnerTexts().catch(() => []);
    return alert.join(" ").trim() || `still on ${page.url()}`;
  }
}

test.describe.configure({ mode: "serial", timeout: 240_000 });

// eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring pattern
test.beforeEach(({}, testInfo) => {
  test.skip(!OPT_IN, "signed-in consent checks are opt-in: set E2E_SIGNED_IN=1");
  test.skip(testInfo.project.name !== "desktop-chromium", "opens its own contexts; runs once");
});

/** Signs `account` in once per run (cached, no retry) and returns null on success, else why it failed. */
async function probe(browser: Browser, account: Role): Promise<string | null> {
  if (probes.has(account.key)) return probes.get(account.key)!;
  const v = await visitor(browser);
  const failure = await signIn(v.page, account);
  await v.close();
  probes.set(account.key, failure);
  return failure;
}

test.beforeAll(async ({ browser }, testInfo) => {
  if (!OPT_IN || testInfo.project.name !== "desktop-chromium") return;
  baseURL = (testInfo.project.use.baseURL as string | undefined) ?? "http://localhost:3888";
  for (const account of ROLES) await probe(browser, account);
});

/** Skips the calling test, with the reason, when this role's sign-in failed. */
async function gate(browser: Browser, account: Role): Promise<void> {
  const failure = await probe(browser, account);
  test.skip(failure !== null, `${account.key} could not sign in (${failure}); staging DB unavailable (quota) or wrong password, set E2E_${account.key.toUpperCase().replace(/-/g, "_")}_EMAIL / _PASSWORD`);
}

/** A fresh visitor who rejects all on the login page, then signs in as `account`. */
async function rejectThenSignIn(browser: Browser, account: Role): Promise<Visitor> {
  const v = await visitor(browser);
  await v.page.goto("/en/login", { waitUntil: "load" });
  await bannerButton(v.page, EN.rejectAll).click();
  await expect(banner(v.page)).toHaveCount(0);
  const failure = await signIn(v.page, account);
  expect(failure, `${account.key} signs in`).toBeNull();
  return v;
}

for (const account of ROLES) {
  test(`${account.key}: after Reject all, the main pages hold only necessary storage and contact no third party`, async ({ browser }) => {
    await gate(browser, account);
    const v = await rejectThenSignIn(browser, account);
    for (const path of account.pages) {
      v.hosts.clear();
      await v.page.goto(path, { waitUntil: "load" });
      await settle(v.page, 1_500);
      await v.hosts.collect(v.page);
      // A signed-in session may keep its own work for the tab (drafts, AI threads): the necessary rows, user-action included.
      expect(violations(await inventory(v.page), { afterReject: true, allow: "necessary" }), `${path}: storage outside the necessary rows`).toEqual([]);
      expect(v.hosts.offenders(), `${path}: third-party hosts`).toEqual([]);
    }
    await v.close();
  });
}

test.describe("375 iPhone dashboard, no choice yet: the banner sits above the bottom nav", () => {
  for (const key of ["seeker", "employer"]) {
    test(`${key}: banner above the bottom nav, no floating launcher under it, no layout shift`, async ({ browser }) => {
      const account = ROLES.find((r) => r.key === key)!;
      await gate(browser, account);
      const v = await visitor(browser, IPHONE);
      await v.page.addInitScript(() => {
        const shifts: number[] = [];
        (window as unknown as { __shifts: number[] }).__shifts = shifts;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
            if (!entry.hadRecentInput) shifts.push(entry.value);
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      expect(await signIn(v.page, account), `${key} signs in`).toBeNull();
      await v.page.goto(account.pages[0], { waitUntil: "load" });
      await settle(v.page, 1_500);

      await expect(banner(v.page), "no choice yet: the banner is showing").toBeVisible();
      const navs = v.page.locator("[data-bottom-nav]:visible");
      expect(await navs.count(), "the dashboard has a visible bottom nav at 375").toBeGreaterThan(0);
      const navBox = (await navs.first().boundingBox())!;
      const bannerBox = (await banner(v.page).boundingBox())!;
      expect(bannerBox.y + bannerBox.height, `banner bottom ${bannerBox.y + bannerBox.height} <= nav top ${navBox.y}`).toBeLessThanOrEqual(navBox.y + 1);

      // Dashboards have no floating accessibility button by design (DashboardShell: showLauncher={false};
      // the account menu opens the panel), so nothing floats under the banner. Public pages, which do have
      // it, are checked in cookie-consent.spec.ts (the button sits above the banner).
      await expect(v.page.getByRole("button", { name: "Accessibility options" }), "no floating launcher over a dashboard").toHaveCount(0);

      const cls = await v.page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts.reduce((a, b) => a + b, 0));
      expect(cls, "cumulative layout shift on the dashboard with the banner").toBeLessThan(0.1);
      await v.close();
    });
  }
});

test.describe("essential flows still work (read-only)", () => {
  for (const account of ROLES) {
    test(`${account.key}: signs in and the dashboard renders`, async ({ browser }) => {
      await gate(browser, account);
      const v = await rejectThenSignIn(browser, account);
      await v.page.goto(account.pages[0], { waitUntil: "load" });
      await expect(v.page.locator("main").first()).toBeVisible({ timeout: 30_000 });
      await expect(v.page.getByText(/something went wrong/i)).toHaveCount(0);
      await v.close();
    });
  }

  test("employer opens an existing candidate's CV", async ({ browser }) => {
    // One probe per account: a wrong password must not count towards locking a shared account.
    await gate(browser, CV_EMPLOYER);
    const v = await visitor(browser);
    await v.page.goto("/en/login", { waitUntil: "load" });
    await bannerButton(v.page, EN.rejectAll).click();
    expect(await signIn(v.page, CV_EMPLOYER), "cv-employer signs in").toBeNull();

    // Read-only: the employer's own applications, as the candidates page lists them.
    const res = await v.page.request.get("/api/applications?page=1&limit=50");
    expect(res.ok(), `GET /api/applications ${res.status()}`).toBe(true);
    const body = (await res.json()) as { applications?: Array<{ jobSeekerId?: { _id?: string; cv?: { originalUrl?: string } } }> };
    const withCv = (body.applications ?? []).find((app) => app.jobSeekerId?._id && app.jobSeekerId.cv?.originalUrl);
    test.skip(!withCv, "this employer has no applicant with a CV");
    const candidateId = withCv!.jobSeekerId!._id!;

    await v.page.goto(`/en/employer/candidates/${candidateId}`, { waitUntil: "load" });
    await v.page.getByRole("button", { name: "View CV", exact: true }).click();
    // The viewer frames the PDF where the browser can show one, and otherwise (headless Chromium has no
    // PDF viewer) offers "Open / Download CV" pointing at the same inline CV route. Either way the
    // route must serve the document to this employer.
    const framed = v.page.locator('iframe[src^="blob:"]');
    const openLink = v.page.getByRole("link", { name: "Open / Download CV" }).last();
    await expect(framed.or(openLink).first(), "the CV viewer opens").toBeVisible({ timeout: 30_000 });
    const cv = await v.page.request.get(`/api/employers/candidates/${candidateId}/cv`);
    expect(cv.status(), "the CV route serves the document").toBe(200);
    expect(cv.headers()["content-type"] ?? "", "a document, not an error page").not.toMatch(/text\/html|application\/json/);
    await v.close();
  });

  test.fixme("seeker applies to a job (needs a throwaway DB)", async () => {});
  test.fixme("seeker uploads a CV (needs a throwaway DB)", async () => {});
});
