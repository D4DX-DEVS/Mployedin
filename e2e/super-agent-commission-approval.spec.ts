import { test, expect, type Page } from "@playwright/test";

/**
 * Regression cover for S1 (SUPER-AGENT-AUDIT.md).
 *
 * PATCH /api/commissions/[id] used to be guarded commissions:update, which
 * super_agent does not hold, so its entire commission approval flow 403'd — and the
 * page discarded the error, so it looked like it had worked. The fix drops the route
 * guard to commissions:read and splits approval from financial editing in-handler.
 *
 * Weakening a guard on a money route is the risky half of that change, so this
 * asserts both directions: approval now reaches the handler, and the privileges the
 * guard used to provide are still enforced (settling and amount edits stay admin).
 */

const SUPER_AGENT = {
  email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com",
  password: process.env.E2E_SA_PASS ?? "SuperAgent@1234",
};

/** withAuth.ts:207,277 — the body returned when the permission matrix denies the action. */
const GUARD_DENIAL = "Forbidden — insufficient permissions";

type ApiResult = { status: number; json: unknown };

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/en/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
}

async function api(page: Page, method: string, url: string, body?: unknown): Promise<ApiResult> {
  await page.waitForFunction(() => document.cookie.includes("csrf-token="), null, { timeout: 30_000 });
  return page.evaluate(
    async (args) => {
      const token =
        document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
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

test.describe("super-agent commission approval (S1)", () => {
  test("approval reaches the handler, but settling and editing money stay admin-only", async ({
    page,
  }) => {
    await login(page, SUPER_AGENT);
    await page.goto("/en/super-agent/commissions", { waitUntil: "networkidle" });

    // GET /api/commissions is already scoped to this super-agent, so anything it
    // returns is a commission they own — no fixture setup needed.
    const list = await api(page, "GET", "/api/commissions?limit=5");
    expect(list.status, `commission list failed: ${JSON.stringify(list.json)}`).toBe(200);

    const commissions = ((list.json as { commissions?: Array<{ _id?: unknown; status?: string }> })
      ?.commissions ?? []) as Array<{ _id?: unknown; status?: string }>;
    test.skip(commissions.length === 0, "no commissions visible to the seeded super-agent");

    const id = String(commissions[0]._id);

    // 1. Approval must reach the handler. Before the fix this was GUARD_DENIAL.
    //    A business rejection (e.g. already approved) is fine — what must not appear
    //    is the permission denial, which is what made the flow unusable.
    const approve = await api(page, "PATCH", `/api/commissions/${id}`, { status: "approved" });
    expect(
      errorOf(approve),
      `approval was blocked by the permission matrix (status ${approve.status})`
    ).not.toBe(GUARD_DENIAL);

    // 2. Settling as paid must still be refused — that is admin's privilege, and it
    //    is what the old commissions:update guard used to protect.
    const settle = await api(page, "PATCH", `/api/commissions/${id}`, { status: "paid" });
    expect(settle.status, `settling should be forbidden, got ${JSON.stringify(settle.json)}`).toBe(403);
    expect(errorOf(settle)).toContain("does not permit editing or settling");

    // 3. Rewriting the amount must still be refused, for the same reason.
    const edit = await api(page, "PATCH", `/api/commissions/${id}`, { amount: 999999 });
    expect(edit.status, `editing the amount should be forbidden, got ${JSON.stringify(edit.json)}`).toBe(403);
    expect(errorOf(edit)).toContain("does not permit editing or settling");
  });
});
