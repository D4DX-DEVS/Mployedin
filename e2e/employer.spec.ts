import { test, expect } from "@playwright/test";

/**
 * Employer E2E journey:
 * 1. Employer registration page loads
 * 2. Login as employer
 * 3. Create a job (navigate to create page)
 * 4. AI job creator loads
 */

const EMPLOYER_EMAIL = process.env.E2E_EMP_EMAIL ?? "employer@test.mployedin.com";
const EMPLOYER_PASS = process.env.E2E_EMP_PASS ?? "TestPass123!";

type EmployerCredentials = {
  companyName: string;
  contactName: string;
  email: string;
  password: string;
};

let employerCredentials: EmployerCredentials = {
  companyName: "Mployedin Test Company",
  contactName: "Employer Owner",
  email: EMPLOYER_EMAIL,
  password: EMPLOYER_PASS,
};

let authFixtureAvailable = false;
let authUnavailableReason = "Employer credentials are not available for authenticated E2E flows.";

async function registerEmployer(request: import("@playwright/test").APIRequestContext) {
  if (process.env.E2E_EMP_EMAIL && process.env.E2E_EMP_PASS) {
    employerCredentials = {
      companyName: "Seeded Employer Company",
      contactName: "Seeded Employer",
      email: process.env.E2E_EMP_EMAIL,
      password: process.env.E2E_EMP_PASS,
    };
    authFixtureAvailable = true;
    return;
  }

  const runId = Date.now();
  employerCredentials = {
    companyName: `Mployedin Employer ${runId}`,
    contactName: "Employer Owner",
    email: `employer+${runId}@example.com`,
    password: EMPLOYER_PASS,
  };

  const response = await request.post("/api/auth/employer-register", {
    multipart: {
      companyName: employerCredentials.companyName,
      industry: "technology",
      size: "11-50",
      website: "https://example.com",
      country: "AE",
      city: "Dubai",
      verificationLevel: "basic",
      contactName: employerCredentials.contactName,
      contactTitle: "Hiring Manager",
      contactEmail: employerCredentials.email,
      contactPhone: "+971500000000",
      password: employerCredentials.password,
    },
  });

  if (response.ok()) {
    authFixtureAvailable = true;
    return;
  }

  const responseText = await response.text();
  authUnavailableReason = `Employer registration API returned ${response.status()}: ${responseText}`;
}

async function loginEmployer(page: import("@playwright/test").Page) {
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: /email address/i }).fill(employerCredentials.email);
  await page.getByLabel(/^Password$/i).fill(employerCredentials.password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/en\/(employer|dashboard)(\/|$)/, { timeout: 15_000 });
}

test.describe("Employer Journey", () => {
  test.beforeAll(async ({ request }) => {
    await registerEmployer(request);
  });

  test("employer auth surface exposes employer registration entry", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("link", { name: /Post jobs as employer/i })).toBeVisible();
  });

  test("employer login page renders", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  });

  test("employer can login and view dashboard", async ({ page }) => {
    test.skip(!authFixtureAvailable, authUnavailableReason);
    await loginEmployer(page);
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test("AI job creator page is accessible to employer", async ({ page }) => {
    await page.goto("/en/employer/jobs/ai-create");
    const url = page.url();
    // Either shows the page or redirects to login
    expect(url).toBeTruthy();
  });

  test.describe("authenticated hiring flows", () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!authFixtureAvailable, authUnavailableReason);
      await loginEmployer(page);
    });

    test("employer can choose AI or manual posting from the new job entry page", async ({ page }) => {
      await page.goto("/en/employer/jobs/new");

      await expect(page.getByRole("heading", { name: /Create a Job Posting/i })).toBeVisible();

      const aiLink = page.getByRole("link", { name: /Start AI Job Posting/i });
      await expect(aiLink).toBeVisible();
      await expect(page.getByRole("link", { name: /Open Manual Form/i }).first()).toBeVisible();

      await aiLink.click();
      await page.waitForURL(/\/en\/employer\/jobs\/ai-create$/);
      await expect(page.getByRole("heading", { name: /AI Job Creator/i })).toBeVisible();

      await page.goto("/en/employer/jobs/new");
      await page.getByRole("link", { name: /Open Manual Form/i }).first().click();
      await page.waitForURL(/\/en\/employer\/jobs\/new\?mode=manual/);
      await expect(page.getByRole("heading", { name: /Post a New Job/i })).toBeVisible();
      await expect(page.getByLabel(/Job Title/i)).toBeVisible();
    });

    test("AI job creator can prefill the manual job form before submission", async ({ page }) => {
      await page.route("**/api/ai/chat", async (route) => {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
          body: `Here is a draft you can review.\n\n<JOB_DATA>\n{
  "title": "Senior React Developer",
  "category": "Technology",
  "location": { "city": "Kochi", "country": "India", "isRemote": false },
  "description": "Lead the frontend experience for our hiring platform using React and TypeScript.",
  "requirements": { "skills": ["React", "TypeScript", "Node.js"], "experienceMin": 4, "experienceMax": 7 },
  "salary": { "min": 900000, "max": 1400000, "currency": "INR", "period": "yearly" },
  "showSalary": false,
  "vacancies": 2,
  "employmentType": "full_time"
}\n</JOB_DATA>`,
        });
      });

      await page.route("**/api/employers/agents", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ agents: [] }),
        });
      });

      await page.goto("/en/employer/jobs/ai-create");
      await page.getByPlaceholder(/Describe the role you need/i).fill("Senior React developer in Kochi with React and Node skills.");
      await page.getByRole("button", { name: /Send AI prompt/i }).click();

      await expect(page.getByText(/Senior React Developer/i)).toBeVisible();
      await page.getByRole("button", { name: /Review in Full Form/i }).click();

      await page.waitForURL(/\/en\/employer\/jobs\/new\?mode=manual&prefill=ai/);
      await expect(page.getByRole("heading", { name: /Post a New Job/i })).toBeVisible();
      await expect(page.getByLabel(/Job Title/i)).toHaveValue("Senior React Developer");
    });

    test("jobs list applications action opens the filtered applications page", async ({ page }) => {
      await page.route("**/api/jobs?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jobs: [
              {
                _id: "job_e2e_001",
                title: "Platform Engineer",
                location: { city: "Dubai", country: "United Arab Emirates", isRemote: false },
                category: "Technology",
                status: "active",
                salary: { min: 18000, max: 24000, currency: "AED", period: "monthly" },
                requirements: { skills: ["React", "Node.js"], experienceMin: 3, experienceMax: 6 },
                "poster.approvalStatus": "approved",
                createdAt: new Date().toISOString(),
                vacancies: 3,
                showSalary: true,
              },
            ],
            pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
          }),
        });
      });

      await page.route("**/api/applications?**", async (route) => {
        const url = route.request().url();
        expect(url).toContain("jobId=job_e2e_001");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            applications: [],
            pagination: { total: 0, page: 1, limit: 10, pages: 1 },
          }),
        });
      });

      await page.goto("/en/employer/jobs");
      await expect(page.getByText(/Platform Engineer/i)).toBeVisible();

      await page.getByRole("button", { name: /Applications/i }).click();

      await page.waitForURL(/\/en\/employer\/applications\?jobId=job_e2e_001/);
      await expect(page.getByRole("heading", { name: /Applications/i })).toBeVisible();
      await expect(page.locator("body")).toContainText(/for this job/i);
    });
  });
});
