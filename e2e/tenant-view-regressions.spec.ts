import { test, expect, type Page } from "@playwright/test";

// ponytail: throwaway proof harness for CONSOLIDATED-AUDIT T1 + T6. Delete after verification.
const ADMIN = { email: "admin@mployedin.com", password: "Admin@1234" };
const AGENT = { email: "agent@mployedin.com", password: "Agent@1234" };
const SA = { email: "superagent@mployedin.com", password: "SuperAgent@1234" };
const EMP_ACTUAL: { email?: string } = {};
const EMP = { email: "employer@mployedin.com", password: "Employer@1234" };

async function login(page: Page, c: { email: string; password: string }) {
  await page.goto("/en/login");
  await page.locator("#email").fill(c.email);
  await page.locator("#password").fill(c.password);
  await page.getByRole("button", { name: /sign in|login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
}


async function csrf(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const t = cookies.find((c) => c.name === "csrf-token")?.value ?? "";
  return { "x-csrf-token": t };
}

test("T1 — admin impersonation is invisible to the employer", async ({ browser }) => {
  // 1. log in as the employer, learn their user id
  const empCtx = await browser.newContext();
  const emp = await empCtx.newPage();
  await login(emp, EMP);
  const meRes = await emp.request.get("/api/employers/me");
  const me = await meRes.json();
  const empUserId = me?.employer?.userId ?? me?.userId ?? me?.employer?.user?._id;
  console.log("ME PAYLOAD KEYS:", JSON.stringify(me).slice(0, 400));
  console.log("EMPLOYER USER ID:", empUserId, meRes.status());
  expect(empUserId).toBeTruthy();

  // 2. admin enters that account
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN);
  const imp = await admin.request.post("/api/admin/impersonate", {
    data: { userId: String(empUserId) },
    headers: await csrf(admin),
  });
  console.log("IMPERSONATE STATUS:", imp.status(), (await imp.text()).slice(0, 300));
  expect(imp.status()).toBe(200);
  await admin.request.post("/api/admin/impersonate", { data: { exit: true }, headers: await csrf(admin) });

  // 3. employer looks at "who has been in my account"
  const hist = await emp.request.get("/api/employers/activity-history?limit=50");
  const hj = await hist.json();
  const items = hj.items ?? [];
  console.log(
    "ACTIVITY ENTRIES:",
    JSON.stringify(items.map((i: any) => ({ action: i.action, role: i.actorRole })))
  );
  // The API strips the entry-point prefix (tenant_view.* / impersonation.*) so the
  // UI labels match; the actor role is what identifies an admin support entry.
  const sawAdminEntry = items.some((i: any) => i.actorRole === "admin" && i.action === "start");
  console.log("T1 RESULT — employer can see the admin entry:", sawAdminEntry);
  expect(sawAdminEntry, "T1: admin entry should be visible to the employer").toBe(true);
});

test("T6 — super_agent creates a job in tenant view despite lacking jobs:create", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, SA);

  const emps = await page.request.get("/api/employers?limit=20");
  const ej = await emps.json();
  const elist = ej.employers ?? ej.data ?? ej.items ?? [];
  console.log("EMPLOYERS VISIBLE:", elist.length);
  expect(elist.length).toBeGreaterThan(0);
  const employerId = elist[0]._id;

  const sw = await page.request.post("/api/tenant/switch", { data: { employerId }, headers: await csrf(page) });
  console.log("SWITCH STATUS:", sw.status(), (await sw.text()).slice(0, 300));
  expect(sw.status()).toBe(200);

  const job = await page.request.post("/api/jobs", {
    headers: await csrf(page),
    data: {
      title: "AUDIT-T6-PROBE",
      description: "probe for tenant-view permission escalation. delete me.",
      location: { country: "IN", city: "Mumbai", isRemote: false },
      employmentType: "full_time",
      experienceLevel: "mid",
    },
  });
  const bodyTxt = (await job.text()).slice(0, 500);
  console.log("T6 RESULT — POST /api/jobs as super_agent in tenant view:", job.status(), bodyTxt);
  await page.request.post("/api/tenant/switch", { data: { exit: true }, headers: await csrf(page) });
  expect(job.status(), "T6: matrix withholds jobs:create from super_agent, so this should be 403").toBe(403);
});

test("T9 — the acting agent gets credit for a job posted in tenant view", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, AGENT);

  const emps = await page.request.get("/api/employers?limit=20");
  const elist = (await emps.json()).employers ?? [];
  expect(elist.length, "agent must have at least one assigned employer").toBeGreaterThan(0);
  const employerId = elist[0]._id;

  const sw = await page.request.post("/api/tenant/switch", { data: { employerId }, headers: await csrf(page) });
  console.log("T9 SWITCH:", sw.status());
  expect(sw.status()).toBe(200);

  const title = `AUDIT-T9-PROBE-${Date.now()}`;
  const created = await page.request.post("/api/jobs", {
    headers: await csrf(page),
    data: {
      title,
      description: "probe for tenant-view agent attribution. delete me.",
      location: { country: "IN", city: "Mumbai", isRemote: false },
      employmentType: "full_time",
      experienceLevel: "mid",
    },
  });
  console.log("T9 CREATE:", created.status());
  expect(created.status()).toBe(201);
  const jobId = (await created.json()).job?._id;

  await page.request.post("/api/tenant/switch", { data: { exit: true }, headers: await csrf(page) });

  // invoiceableOnly scopes strictly to { agentId: <this agent> } — the same field
  // that drives vacanciesPosted, the approval notification and commission.
  const mine = await page.request.get("/api/jobs?invoiceableOnly=true&limit=100");
  const titles = ((await mine.json()).jobs ?? []).map((j: any) => j.title);
  const credited = titles.includes(title);
  console.log("T9 RESULT — acting agent credited:", credited, "jobId:", jobId);
  expect(credited, "T9: job must be stamped with the acting agent, not an auto-assigned one").toBe(true);
});
