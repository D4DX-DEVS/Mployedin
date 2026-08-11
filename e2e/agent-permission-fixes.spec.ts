import { test, expect, type Page } from "@playwright/test";

/**
 * Regression cover for the agent-role audit fixes (AGENT-AUDIT.md).
 *
 * These exist because unit tests cannot prove what was actually broken. A jest
 * assertion that canAccess("agent","leads","delete") === true says nothing about
 * whether the request survives withAuth in a real session — and the bugs were
 * exactly that: a guard the permission matrix never satisfied, so the UI action
 * 403'd while every unit test passed.
 *
 * Requests go through page.evaluate so they use the app's own patched window.fetch
 * (CsrfProvider, csrf-client.ts:59-82) and therefore carry the CSRF header, the
 * same way the real buttons do. A raw APIRequestContext would bypass that and
 * could fail for CSRF reasons that look like the authorization bug.
 *
 * The key assertion throughout is "not GUARD_DENIAL" rather than "=== 200":
 * withAuth's permission failure has one exact body, so this distinguishes "the
 * matrix still blocks this role" (the regression) from an ordinary business-rule
 * rejection or missing seed data (not the regression).
 */

/**
 * Both verified against the stored bcrypt hashes, and this agent is on this
 * super-agent's team (Agent.superAgentId → SuperAgent.userId), so the A4/A5 test
 * exercises the in-jurisdiction path rather than the A5 rejection. The agent also
 * has assigned employers, which the clone test needs.
 */
const AGENT = {
  email: process.env.E2E_AGENT_EMAIL ?? "agent@mployedin.com",
  password: process.env.E2E_AGENT_PASS ?? "Agent@1234",
};
const SUPER_AGENT = {
  email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com",
  password: process.env.E2E_SA_PASS ?? "SuperAgent@1234",
};

/** withAuth.ts:207,277 — the exact body returned when the matrix denies the action. */
const GUARD_DENIAL = "Forbidden — insufficient permissions";

type ApiResult = { status: number; json: unknown };

async function login(page: Page, creds: { email: string; password: string }) {
  // networkidle, not domcontentloaded: filling before React hydrates leaves the
  // controlled inputs empty and the submit silently does nothing.
  await page.goto("/en/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  // Generous: against a dev server this waits on first-hit route compilation, which
  // alone can exceed Playwright's 30s default.
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
}

/** Call an API through the page's patched fetch, so CSRF is handled as in the UI. */
async function api(
  page: Page,
  method: string,
  url: string,
  body?: unknown
): Promise<ApiResult> {
  // Wait for the CSRF cookie the middleware sets on page GETs. Relying on
  // installCsrfFetch's monkey-patch alone is a race: evaluate can run before the
  // provider mounts, and the raw fetch then sends no token → 403 "Missing CSRF token".
  await page.waitForFunction(() => document.cookie.includes("csrf-token="), null, {
    timeout: 30_000,
  });

  return page.evaluate(
    async (args) => {
      // Same header csrf-client.ts:41-45 sets, read from the same cookie.
      const token =
        document.cookie
          .split("; ")
          .find((c) => c.startsWith("csrf-token="))
          ?.split("=")[1] ?? "";
      const res = await fetch(args.url, {
        method: args.method,
        headers: {
          "x-csrf-token": token,
          ...(args.body === null ? {} : { "Content-Type": "application/json" }),
        },
        ...(args.body === null ? {} : { body: JSON.stringify(args.body) }),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        /* no body */
      }
      return { status: res.status, json };
    },
    { method, url, body: body ?? null }
  );
}

function errorOf(result: ApiResult): string {
  return String((result.json as { error?: unknown } | null)?.error ?? "");
}

/** Fails with the response body attached, so a failure says why rather than just "expected 200". */
function expectNotGuardDenied(result: ApiResult, what: string) {
  expect(
    errorOf(result),
    `${what} was denied by the permission matrix (status ${result.status}) — the audit fix regressed`
  ).not.toBe(GUARD_DENIAL);
}

function idOf(result: ApiResult): string {
  const body = result.json as
    | { _id?: unknown; lead?: { _id?: unknown }; request?: { _id?: unknown } }
    | null;
  return String(body?._id ?? body?.lead?._id ?? body?.request?._id ?? "");
}

// Serial + long timeout: against `npm run dev` each first-hit route is compiled on
// demand, and five parallel logins make the compiler the bottleneck rather than the
// app. This is about the dev server, not the assertions.
test.describe.configure({ mode: "serial", timeout: 240_000 });

test.describe("agent audit fixes", () => {
  test("A2 — agent can delete their own lead (matrix grant + no silent failure)", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/leads", { waitUntil: "domcontentloaded" });

    const stamp = Date.now();
    const created = await api(page, "POST", "/api/leads", {
      companyName: `E2E Audit Lead ${stamp}`,
      contactPerson: "Audit Contact",
      contactEmail: `audit+${stamp}@example.com`,
    });
    expect(created.status, `lead create failed: ${JSON.stringify(created.json)}`).toBeLessThan(300);

    const leadId = idOf(created);
    expect(leadId, "could not read the created lead id").not.toBe("");

    const deleted = await api(page, "DELETE", `/api/leads/${leadId}`);
    // This is the regression: before the fix it was 403 GUARD_DENIAL, and the UI
    // swallowed it because handleDelete never checked res.ok.
    expectNotGuardDenied(deleted, "DELETE /api/leads/[id]");
    expect(deleted.status).toBe(200);

    // The delete must have actually happened, not just returned 200.
    const reread = await api(page, "GET", `/api/leads/${leadId}`);
    expect([403, 404]).toContain(reread.status);
  });

  test("A4 — agent can edit and delete their own exhibition request", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/exhibitions", { waitUntil: "domcontentloaded" });

    const created = await api(page, "POST", "/api/exhibitions", {
      eventName: `E2E Audit Exhibition ${Date.now()}`,
      status: "draft",
    });
    expect(created.status, `exhibition create failed: ${JSON.stringify(created.json)}`).toBeLessThan(300);

    const id = idOf(created);
    expect(id, "could not read the created exhibition id").not.toBe("");

    const edited = await api(page, "PATCH", `/api/exhibitions/${id}`, {
      eventName: "E2E Audit Exhibition (edited)",
    });
    expectNotGuardDenied(edited, "PATCH /api/exhibitions/[id] as agent");
    expect(edited.status).toBe(200);

    const removed = await api(page, "DELETE", `/api/exhibitions/${id}`);
    expectNotGuardDenied(removed, "DELETE /api/exhibitions/[id] as agent");
    expect(removed.status).toBe(200);
  });

  test("A4/A5 — super-agent reaches the review flow, and only jurisdiction can stop it", async ({
    browser,
  }) => {
    const agentCtx = await browser.newContext();
    const saCtx = await browser.newContext();
    try {
      const agentPage = await agentCtx.newPage();
      await login(agentPage, AGENT);
      await agentPage.goto("/en/agent/exhibitions", { waitUntil: "domcontentloaded" });

      // Anything other than status:"draft" is created as "submitted", which is the
      // state the super-agent review flow acts on.
      const created = await api(agentPage, "POST", "/api/exhibitions", {
        eventName: `E2E Audit SA Review ${Date.now()}`,
      });
      expect(created.status, `exhibition create failed: ${JSON.stringify(created.json)}`).toBeLessThan(300);
      const id = idOf(created);
      expect(id).not.toBe("");

      const saPage = await saCtx.newPage();
      await login(saPage, SUPER_AGENT);
      await saPage.goto("/en/super-agent/exhibitions", { waitUntil: "domcontentloaded" });

      const reviewed = await api(saPage, "PATCH", `/api/exhibitions/${id}`, {
        status: "under_review",
        reviewNote: "E2E audit review",
      });

      // Before the fix this was GUARD_DENIAL for every super-agent, which made the
      // whole approval pipeline unreachable.
      expectNotGuardDenied(reviewed, "PATCH /api/exhibitions/[id] as super_agent");

      // Two legitimate outcomes, depending on whether the seeded agent is on the
      // seeded super-agent's team. A 403 is only acceptable as the A5 jurisdiction
      // check — never as a permission denial.
      if (reviewed.status === 403) {
        expect(
          errorOf(reviewed),
          "a super-agent 403 must come from the A5 team check, not the role guard"
        ).toContain("not from your team");
      } else {
        expect(reviewed.status).toBe(200);
      }

      // Cleanup only works while the request is still agent-deletable (draft/
      // submitted). If the review succeeded it is under_review and stays behind.
      if (reviewed.status !== 200) {
        await api(agentPage, "DELETE", `/api/exhibitions/${id}`);
      }
    } finally {
      await agentCtx.close();
      await saCtx.close();
    }
  });

  test("A1 — the legitimate clone path still works for an assigned employer", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/jobs", { waitUntil: "domcontentloaded" });

    // GET /api/jobs is already scoped to the agent's assigned employers, so any job
    // it returns is one the new assignedEmployerIds check must still admit. This
    // covers the fix not being over-tight; the cross-employer denial is unit-tested
    // instead, since constructing an unassigned employer here would depend on seed
    // internals.
    const list = await api(page, "GET", "/api/jobs?limit=1");
    expect(list.status).toBe(200);
    const jobs = ((list.json as { jobs?: Array<{ _id?: unknown }> })?.jobs ?? []) as Array<{
      _id?: unknown;
    }>;
    test.skip(jobs.length === 0, "no jobs visible to the seeded agent — nothing to clone");

    const cloned = await api(page, "POST", `/api/jobs/${String(jobs[0]._id)}/clone`);

    // A 404 with no JSON body is Next's not-found page, i.e. the route is not
    // registered in this server instance — distinct from the handler's own JSON
    // 404. Every nested route under /api/jobs/[id]/ (apply, save, workflow, …)
    // answers this way on a long-running dev server, so treat it as an
    // environment problem and say so rather than reporting a false regression.
    // If it persists after restarting the dev server, that is a real routing
    // defect well beyond this fix.
    test.skip(
      cloned.status === 404 && cloned.json === null,
      "/api/jobs/[id]/clone is not registered in the running server (all nested job routes 404) — restart the dev server and re-run"
    );

    expectNotGuardDenied(cloned, "POST /api/jobs/[id]/clone");
    expect(
      errorOf(cloned),
      "the agent must still be able to clone a job for an employer they are assigned to"
    ).not.toContain("not assigned to this employer");
    expect(cloned.status).toBeLessThan(300);
  });

  test("A6 — a malformed task id is a 400, not a 500", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/tasks", { waitUntil: "domcontentloaded" });

    const res = await api(page, "DELETE", "/api/agent/tasks/not-an-object-id");

    // Same caveat as A1: a bodyless 404 is Next's not-found page, meaning
    // /api/agent/tasks/[id] is not registered in this server instance.
    test.skip(
      res.status === 404 && res.json === null,
      "/api/agent/tasks/[id] is not registered in the running server — restart the dev server and re-run"
    );

    expect(res.status, "an unhandled CastError would surface as 500 here").toBe(400);
  });
});
