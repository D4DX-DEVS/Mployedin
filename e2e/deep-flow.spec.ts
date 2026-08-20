import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Deep business-flow E2E: exercises the full hiring pipeline end to end with
 * real accounts against a running server.
 *
 *   employer creates job (goes live immediately) → job seeker applies
 *   → agent sees the pipeline → employer schedules interview → employer sends
 *   offer → job seeker accepts → admin records placement → cleanup (close job)
 *
 * Mutations go through the real REST APIs (with CSRF), verifications assert
 * both API state and what each role actually sees in the UI.
 *
 * Run: E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/deep-flow.spec.ts --project=chromium --workers=1
 */

const CREDS = {
  employer: { email: "employer@mployedin.com", password: "Employer@1234" },
  seeker: { email: "jobseeker@mployedin.com", password: "JobSeeker@1234" },
  admin: { email: "admin@mployedin.com", password: "Admin@1234" },
  agent: { email: "agent@mployedin.com", password: "Agent@1234" },
};

const JOB_TITLE = `E2E Pipeline QA Engineer ${Date.now()}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

/** JSON API call through the page's session, with the double-submit CSRF header. */
async function api(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  url: string,
  body?: unknown,
) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "csrf-token")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
    ...(body !== undefined ? { data: body } : {}),
  });
  return res;
}

/** Next Tuesday 10:00 Asia/Dubai (06:00 UTC), minutes jittered per run to avoid
 *  instant-booking conflicts across repeated runs. */
function interviewSlot(): string {
  const d = new Date();
  d.setUTCHours(6, Math.floor(Date.now() / 60_000) % 45, 0, 0);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() !== 2);
  return d.toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

test.describe("Deep flow: hire pipeline", () => {
  test("job → apply → interview → offer → accept → placement", async ({ browser }) => {
    test.setTimeout(480_000);

    const roles: Record<string, { ctx: BrowserContext; page: Page }> = {};
    for (const key of ["employer", "seeker", "admin", "agent"] as const) {
      const ctx = await browser.newContext();
      roles[key] = { ctx, page: await ctx.newPage() };
      await login(roles[key].page, CREDS[key].email, CREDS[key].password);
    }
    const employer = roles.employer.page;
    const seeker = roles.seeker.page;
    const admin = roles.admin.page;
    const agent = roles.agent.page;

    let jobId = "";
    let applicationId = "";
    let jobSeekerId = "";
    let employerId = "";
    let offerId = "";

    try {
      await test.step("server healthy", async () => {
        const res = await api(admin, "GET", "/api/health");
        expect(res.status(), "GET /api/health").toBe(200);
      });

      await test.step("employer creates job", async () => {
        const res = await api(employer, "POST", "/api/jobs", {
          title: JOB_TITLE,
          description:
            "End-to-end pipeline test position. Automated QA engineer role covering the full hiring flow from application to placement.",
          category: "Engineering",
          location: { country: "United Arab Emirates", city: "Dubai", isRemote: false },
          salary: { min: 12000, max: 18000, currency: "AED", period: "monthly" },
          requirements: { skills: ["QA", "Automation"], experienceMin: 1, experienceMax: 10 },
          employmentType: "full_time",
          workMode: "onsite",
          status: "active",
        });
        expect(res.status(), await res.text()).toBe(201);
        const { job } = await res.json();
        jobId = String(job._id);
        expect(jobId).toBeTruthy();

        // No approval queue: an employer publish goes live immediately.
        expect(job.status).toBe("active");
      });

      await test.step("employer sees job in dashboard", async () => {
        await employer.goto("/en/employer/jobs", { waitUntil: "domcontentloaded" });
        await expect(employer.locator("body")).toContainText(JOB_TITLE, { timeout: 20_000 });
      });

      await test.step("job seeker applies", async () => {
        const res = await api(seeker, "POST", "/api/applications", {
          jobId,
          easyApply: true,
          coverLetter: "Automated E2E application for the hiring-pipeline test.",
          includeProfileCv: true,
        });
        expect(res.status(), await res.text()).toBe(201);
        const { application } = await res.json();
        applicationId = String(application._id);
        jobSeekerId = String(application.jobSeekerId);
        employerId = String(application.employerId);
        expect(applicationId && jobSeekerId && employerId).toBeTruthy();

        await seeker.goto("/en/job-seeker/applications", { waitUntil: "domcontentloaded" });
        await expect(seeker.locator("body")).toContainText(JOB_TITLE, { timeout: 20_000 });
      });

      await test.step("agent can read the pipeline", async () => {
        // Agent visibility is scope-dependent (assigned employers); assert the
        // agent APIs work, and log whether this application is in their book.
        const res = await api(agent, "GET", `/api/applications?jobId=${jobId}`);
        expect(res.status(), await res.text()).toBe(200);
        const data = await res.json();
        const visible = (data.applications ?? []).some(
          (a: { _id: string }) => String(a._id) === applicationId,
        );
        console.log(`agent sees pipeline application: ${visible}`);
      });

      await test.step("employer schedules interview", async () => {
        const res = await api(employer, "POST", "/api/interviews", {
          applicationId,
          type: "video",
          scheduledAt: interviewSlot(),
          duration: 30,
          instructions: "Automated E2E pipeline interview.",
        });
        expect(res.status(), await res.text()).toBe(201);

        // Application status advanced
        const check = await api(employer, "GET", `/api/applications?jobId=${jobId}`);
        expect(check.status()).toBe(200);
        const { applications } = await check.json();
        const app = (applications ?? []).find(
          (a: { _id: string; status: string }) => String(a._id) === applicationId,
        );
        expect(app?.status, "application status after scheduling").toBe("interview_scheduled");

        // Seeker sees it
        await seeker.goto("/en/job-seeker/interviews", { waitUntil: "domcontentloaded" });
        await expect(seeker.locator("body")).toContainText(JOB_TITLE, { timeout: 20_000 });
      });

      await test.step("employer sends offer", async () => {
        const res = await api(employer, "POST", "/api/offers", {
          applicationId,
          salary: { amount: 15000, currency: "AED", period: "monthly" },
          startDate: daysFromNow(30),
          benefits: "Standard package (E2E test).",
        });
        expect(res.status(), await res.text()).toBe(201);
        const { offer } = await res.json();
        offerId = String(offer._id);
        expect(offerId).toBeTruthy();
      });

      await test.step("job seeker accepts offer", async () => {
        await seeker.goto("/en/job-seeker/offers", { waitUntil: "domcontentloaded" });
        await expect(seeker.locator("body")).toContainText(JOB_TITLE, { timeout: 20_000 });

        const res = await api(seeker, "PATCH", `/api/offers/${offerId}`, {
          status: "accepted",
          signatureName: "E2E Pipeline Seeker",
        });
        expect(res.status(), await res.text()).toBe(200);
      });

      await test.step("admin records placement", async () => {
        const res = await api(admin, "POST", "/api/placements", {
          applicationId,
          jobId,
          jobSeekerId,
          employerId,
          startDate: daysFromNow(30),
          salary: 15000,
          currency: "AED",
          notes: "Automated E2E pipeline placement.",
        });
        expect(res.status(), await res.text()).toBe(201);

        await admin.goto("/en/admin/placements", { waitUntil: "domcontentloaded" });
        await expect(admin.locator("body")).toContainText(JOB_TITLE, { timeout: 20_000 });

        // Employer sees the placement too
        const empView = await api(employer, "GET", "/api/placements?page=1&limit=20");
        expect(empView.status()).toBe(200);
        const { placements } = await empView.json();
        const found = (placements ?? []).some(
          (p: { jobTitle?: string }) => p.jobTitle === JOB_TITLE,
        );
        expect(found, "employer placement list contains the new placement").toBe(true);
      });
    } finally {
      // Best-effort cleanup: close the job so repeated runs don't pile up
      // active listings. Pipeline records (application/offer/placement) stay —
      // they're normal historical data in the test environment.
      if (jobId) {
        await api(employer, "PATCH", `/api/jobs/${jobId}`, { status: "closed" }).catch(() => {});
      }
      for (const r of Object.values(roles)) await r.ctx.close();
    }
  });
});
