import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Full production audit E2E: logs in as each of the 5 roles, sweeps every
 * static dashboard page, and verifies cross-role isolation (pages + APIs).
 * Run: E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/full-role-audit.spec.ts --project=chromium --workers=1
 */

type RoleDef = {
  role: string;
  email: string;
  password: string;
  home: string; // dashboard landing prefix (no locale)
  pages: string[]; // static routes to sweep (no locale)
};

const ROLES: RoleDef[] = [
  {
    role: "admin",
    email: "admin@mployedin.com",
    password: "Admin@1234",
    home: "/admin",
    pages: [
      "/admin", "/admin/activity-timeline", "/admin/agents", "/admin/analytics", "/admin/applications",
      "/admin/approvals", "/admin/audit", "/admin/audit-logs", "/admin/bulk-import", "/admin/cms",
      "/admin/cms/banners", "/admin/cms/blogs", "/admin/cms/contact-submissions", "/admin/cms/faqs",
      "/admin/cms/static-pages", "/admin/cms/static-pages/new", "/admin/cms/testimonials", "/admin/cms/videos",
      "/admin/commissions", "/admin/commissions-report", "/admin/communications", "/admin/employers",
      "/admin/exhibitions", "/admin/exhibitions/analytics", "/admin/gdpr", "/admin/impersonate",
      "/admin/interviews", "/admin/invoices", "/admin/invoices/new", "/admin/job-attributes",
      "/admin/job-attributes/career-levels", "/admin/job-attributes/degree-levels", "/admin/job-attributes/degree-types",
      "/admin/job-attributes/functional-areas", "/admin/job-attributes/genders", "/admin/job-attributes/industries",
      "/admin/job-attributes/job-experience", "/admin/job-attributes/job-shifts", "/admin/job-attributes/job-skills",
      "/admin/job-attributes/job-types", "/admin/job-attributes/language-levels", "/admin/job-attributes/major-subjects",
      "/admin/job-attributes/marital-statuses", "/admin/job-attributes/ownership-types", "/admin/job-attributes/result-types",
      "/admin/job-attributes/salary-periods", "/admin/jobs", "/admin/jobs/new", "/admin/job-seekers",
      "/admin/location-data", "/admin/location-data/cities", "/admin/location-data/countries", "/admin/location-data/states",
      "/admin/matching-weight-templates", "/admin/messages", "/admin/placements", "/admin/referral-links",
      "/admin/reports", "/admin/resources", "/admin/settings", "/admin/settings/notifications",
      "/admin/subscription-dashboard", "/admin/subscription-plans", "/admin/subscriptions", "/admin/super-agents",
      "/admin/system-health", "/admin/target-management", "/admin/target-management/create", "/admin/target-report",
      "/admin/targets", "/admin/territory", "/admin/users", "/admin/webhooks", "/admin/workflow-templates",
    ],
  },
  {
    role: "super_agent",
    email: "superagent@mployedin.com",
    password: "SuperAgent@1234",
    home: "/super-agent",
    pages: [
      "/super-agent", "/super-agent/agents", "/super-agent/applications", "/super-agent/approvals",
      "/super-agent/commissions", "/super-agent/commissions-report", "/super-agent/employers",
      "/super-agent/exhibitions", "/super-agent/exhibitions/analytics", "/super-agent/insights",
      "/super-agent/interviews", "/super-agent/invoices", "/super-agent/invoices/new", "/super-agent/jobs",
      "/super-agent/job-seekers", "/super-agent/leads", "/super-agent/market", "/super-agent/messages",
      "/super-agent/placements", "/super-agent/referral-links", "/super-agent/reports", "/super-agent/resources",
      "/super-agent/settings", "/super-agent/target-management", "/super-agent/target-management/create",
      "/super-agent/target-report", "/super-agent/targets", "/super-agent/territory",
    ],
  },
  {
    role: "agent",
    email: "agent@mployedin.com",
    password: "Agent@1234",
    home: "/agent",
    pages: [
      "/agent", "/agent/calendar", "/agent/candidates", "/agent/chat", "/agent/commissions",
      "/agent/commissions-report", "/agent/employers", "/agent/exhibitions", "/agent/interviews",
      "/agent/invoices", "/agent/jobs", "/agent/jobs/new", "/agent/job-seekers", "/agent/leads",
      "/agent/leads/new", "/agent/messages", "/agent/offers", "/agent/placements", "/agent/referral-links",
      "/agent/reports", "/agent/resources", "/agent/settings", "/agent/target-management",
      "/agent/target-report", "/agent/targets", "/agent/tasks",
    ],
  },
  {
    role: "employer",
    email: "employer@mployedin.com",
    password: "Employer@1234",
    home: "/employer",
    pages: [
      "/employer", "/employer/activity-history", "/employer/analytics", "/employer/applications",
      "/employer/assessments", "/employer/background-checks", "/employer/calendar", "/employer/campaigns",
      "/employer/candidates", "/employer/comm-templates", "/employer/interviews", "/employer/interviews/bulk",
      "/employer/invoices", "/employer/jobs", "/employer/jobs/ai-create", "/employer/jobs/ai-extract",
      "/employer/jobs/new", "/employer/job-templates", "/employer/matching-weights", "/employer/messages",
      "/employer/my-posters", "/employer/offers", "/employer/payment-setup", "/employer/placements",
      "/employer/scorecards", "/employer/screening-analytics", "/employer/settings", "/employer/subscription",
      "/employer/talent-pools", "/employer/team", "/employer/team/activity-logs", "/employer/workflow",
    ],
  },
  {
    role: "job_seeker",
    email: "jobseeker@mployedin.com",
    password: "JobSeeker@1234",
    home: "/job-seeker",
    pages: [
      "/job-seeker", "/job-seeker/applications", "/job-seeker/calendar", "/job-seeker/companies",
      "/job-seeker/courses", "/job-seeker/cv", "/job-seeker/documents", "/job-seeker/experience",
      "/job-seeker/interviews", "/job-seeker/jobs", "/job-seeker/messages", "/job-seeker/offers",
      "/job-seeker/portfolio", "/job-seeker/preferences", "/job-seeker/profile",
      "/job-seeker/profile/personal-details", "/job-seeker/profile-boost", "/job-seeker/profile-views",
      "/job-seeker/referral", "/job-seeker/saved-searches", "/job-seeker/search", "/job-seeker/settings",
      "/job-seeker/settings/notifications", "/job-seeker/skills", "/job-seeker/subscription",
    ],
  },
];

const ERROR_MARKERS = [
  "Something went wrong",
  "Application error",
  "This page could not be found",
  "Internal Server Error",
];

async function login(page: Page, email: string, password: string) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').first().click();
  // Wait until we leave the login page (dashboard redirect)
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

async function sweepPage(page: Page, path: string): Promise<string | null> {
  try {
    const resp = await page.goto(`/en${path}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    if (resp && resp.status() >= 500) return `${path}: HTTP ${resp.status()}`;
    // Let client components mount + first fetches settle
    await page.waitForTimeout(1200);
    const url = page.url();
    if (url.includes("/login")) return `${path}: bounced to login (session lost)`;
    const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
    for (const marker of ERROR_MARKERS) {
      if (body.includes(marker)) return `${path}: error marker "${marker}"`;
    }
    if (body.trim().length < 20) return `${path}: page rendered (near) empty`;
    return null;
  } catch (e) {
    return `${path}: ${(e as Error).message.split("\n")[0]}`;
  }
}

test.describe("Full role audit", () => {
  for (const def of ROLES) {
    test(`${def.role}: login + full page sweep`, async ({ page }) => {
      test.setTimeout(600_000);
      await login(page, def.email, def.password);
      expect(page.url(), `${def.role} should land on own dashboard`).toContain(def.home);

      const failures: string[] = [];
      for (const path of def.pages) {
        const fail = await sweepPage(page, path);
        if (fail) failures.push(fail);
      }
      expect(failures, `${def.role} broken pages:\n${failures.join("\n")}`).toEqual([]);
    });
  }

  test("cross-role isolation: pages redirect, APIs 401/403", async ({ browser }) => {
    test.setTimeout(300_000);
    const checks: Array<{ as: RoleDef; page: string; apis: string[] }> = [
      { as: ROLES[2] /* agent */, page: "/en/admin", apis: ["/api/super-agent/dashboard", "/api/admin/users"] },
      { as: ROLES[4] /* job_seeker */, page: "/en/employer", apis: ["/api/agent/dashboard", "/api/super-agent/leads", "/api/admin/users"] },
      { as: ROLES[3] /* employer */, page: "/en/super-agent", apis: ["/api/super-agent/dashboard", "/api/agent/dashboard"] },
      { as: ROLES[1] /* super_agent */, page: "/en/admin", apis: ["/api/agent/dashboard", "/api/admin/users"] },
    ];

    for (const c of checks) {
      const ctx: BrowserContext = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, c.as.email, c.as.password);

      // Foreign dashboard page must redirect away
      await page.goto(c.page, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      expect(page.url(), `${c.as.role} must not stay on ${c.page}`).toContain(c.as.home);

      // Foreign APIs must 401/403 (never 200)
      for (const api of c.apis) {
        const resp = await page.request.get(api);
        expect([401, 403], `${c.as.role} GET ${api} → ${resp.status()}`).toContain(resp.status());
      }
      await ctx.close();
    }
  });

  test("anonymous: protected surfaces redirect to login", async ({ page }) => {
    for (const path of ["/en/admin", "/en/super-agent", "/en/agent", "/en/employer", "/en/job-seeker", "/en/onboarding"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(page.url(), `${path} must bounce anonymous to login`).toContain("/login");
    }
    // Public pages stay public
    for (const path of ["/en", "/en/jobs", "/en/companies"]) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(resp?.status(), `${path} should be public`).toBeLessThan(400);
      expect(page.url()).not.toContain("/login");
    }
  });
});
