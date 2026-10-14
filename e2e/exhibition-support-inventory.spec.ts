import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Exhibition "Support and inventory" end to end (client feedback 2026-10-14):
 *
 *   1. Agent requests TV ×1, Volunteers ×3 and Other "Projector screen" ×1 on a
 *      new exhibition request — the request stores them, nothing is allocated.
 *   2. Super agent sees separate Exhibition date / Created columns, sorts by
 *      both (undated last, across filtered pages too), filters with the
 *      "Awaiting your review" figure, sees requested support as chips and as
 *      requested / allocated / delivered in the detail, then starts a review,
 *      approves (nothing allocated), rejects and requests changes with the
 *      reasons required, and all of it survives a reload.
 *   3. Admin (after the existing review + budget steps) allocates in the
 *      inspector: over-allocation is refused, a partial allocation shows as
 *      "Partially allocated"; moving to Delivery warns but is allowed; delivery
 *      refuses "Issue" without a note, records Delivered / Issue, and all of it
 *      survives a reload.
 *
 * Runs against the seeded agent@ / superagent@ / admin@ accounts. The request
 * it creates is deleted at the end.
 */

const AGENT = { email: process.env.E2E_AGENT_EMAIL ?? "agent@mployedin.com", password: process.env.E2E_AGENT_PASS ?? "Agent@1234" };
const SUPER_AGENT = { email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com", password: process.env.E2E_SA_PASS ?? "SuperAgent@1234" };
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@mployedin.com", password: process.env.E2E_ADMIN_PASS ?? "Admin@1234" };

const SHOTS = "test-results/exhibition-support";
const EVENT_NAME = `E2E Support Expo ${Date.now()}`;

test.describe.configure({ mode: "serial", timeout: 420_000 });
test.use({ actionTimeout: 20_000 });
// One pass on the desktop project: the flow writes shared staging data. The
// phone layout is checked inside the test by resizing (step 2).
test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop-chromium", "desktop project only");
});

async function login(browser: Browser, creds: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // The cookie banner is answered once per browser (localStorage); left open
  // it covers the bottom of the screen, inspector footer included.
  await context.addInitScript(() => {
    try { window.localStorage.setItem("cookie-consent", "accepted"); } catch { /* ignore */ }
  });
  const page = await context.newPage();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/en/login", { waitUntil: "networkidle" });
    // The form re-renders on hydration; filling too early is silently lost.
    await page.waitForTimeout(2000);
    await page.locator("#email").fill(creds.email);
    await page.locator("#password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 });
      return page;
    } catch {
      /* retry */
    }
  }
  throw new Error(`could not sign in as ${creds.email}`);
}

async function api(page: Page, method: string, url: string, body?: unknown) {
  await page.waitForFunction(() => document.cookie.includes("csrf-token="), null, { timeout: 30_000 });
  return page.evaluate(
    async (args) => {
      const token = decodeURIComponent(document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "");
      const res = await fetch(args.url, {
        method: args.method,
        headers: { "x-csrf-token": token, ...(args.body === null ? {} : { "Content-Type": "application/json" }) },
        ...(args.body === null ? {} : { body: JSON.stringify(args.body) }),
      });
      let json: unknown = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, json: json as Record<string, unknown> | null };
    },
    { method, url, body: body ?? null },
  );
}

let requestId = "";
const extraIds: string[] = [];

test("agent requests support items; super agent sees dates, sort and support; admin allocates and delivers", async ({ browser }) => {
  /* ── 1. Agent: new request with support items ─────────────────────── */
  const agent = await login(browser, AGENT);
  await agent.goto("/en/agent/exhibitions", { waitUntil: "networkidle" });
  await agent.getByRole("button", { name: /new request/i }).first().click();
  const form = agent.getByRole("dialog", { name: /new exhibition request/i });
  await expect(form).toBeVisible();
  // Two steps, one fixed dialog height; only the fields scroll.
  await expect(form.getByText("1Event Details")).toBeVisible();
  await expect(form.getByText("2Budget & support")).toBeVisible();
  const fieldsFit = () => form.evaluate((node) => {
    const body = node.querySelector("form > div.overflow-y-auto") as HTMLElement | null;
    return body ? body.scrollHeight - body.clientHeight : -1;
  });

  await form.getByPlaceholder("e.g., Dubai Career Expo 2026").fill(EVENT_NAME);

  // Start date: the 15th of next month.
  const next = new Date();
  next.setMonth(next.getMonth() + 1, 15);
  await form.getByRole("button", { name: "Select start date" }).click();
  const picker = agent.locator("[data-radix-popper-content-wrapper]").last();
  await picker.locator("button").nth(1).click(); // next month (prev, next are the first two buttons)
  await picker.getByRole("gridcell", { name: next.toLocaleDateString("en", { month: "long", day: "numeric" }), exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(form).toBeVisible();

  const step1Height = await form.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  await agent.screenshot({ path: `${SHOTS}/00-agent-step1.png` });
  await form.getByRole("button", { name: "Next" }).click();

  // Step 2: budget, participation and support.
  const section = form.getByRole("group", { name: /support & inventory required/i });
  await expect(section).toBeVisible();
  // Same dialog height on both steps: Next must not make the dialog jump.
  expect(await form.evaluate((node) => Math.round(node.getBoundingClientRect().height))).toBe(step1Height);
  // Participation and support are dropdowns; picked support items get a row each.
  await form.getByRole("combobox", { name: "Participation Style" }).click();
  await agent.getByRole("option", { name: "Stall" }).click();
  await agent.getByRole("option", { name: "Booth" }).click();
  await agent.keyboard.press("Escape");
  await expect(form.getByRole("combobox", { name: "Participation Style" })).toContainText("Stall, Booth");
  await expect(form).toBeVisible();
  await form.getByRole("combobox", { name: /support & inventory/i }).click();
  await agent.getByRole("option", { name: "TV" }).click();
  await agent.getByRole("option", { name: "Volunteers (people)" }).click();
  await agent.getByRole("option", { name: "Other" }).click();
  await agent.keyboard.press("Escape");
  await expect(form).toBeVisible();
  await expect(section.getByRole("listitem")).toHaveCount(3);
  // A ticked item with no quantity is caught before anything is sent.
  await form.getByRole("button", { name: /submit request/i }).click();
  await expect(form.getByRole("alert")).toContainText("Enter a quantity of 1 or more for each support item you ticked.");

  await section.locator("#support-tv-qty").fill("1");
  await section.locator("#support-volunteers-qty").fill("3");
  await section.getByLabel("What is it?").fill("Projector screen");
  await section.locator("#support-other-qty").fill("1");
  await form.getByLabel("Additional requirements").fill("Two power sockets near the booth.");
  test.info().annotations.push({ type: "step 2 overflow px (3 items ticked)", description: String(await fieldsFit()) });
  await agent.screenshot({ path: `${SHOTS}/01-agent-form-support.png`, fullPage: false });

  // Back keeps what was typed.
  await form.getByRole("button", { name: "Back" }).click();
  await expect(form.getByPlaceholder("e.g., Dubai Career Expo 2026")).toHaveValue(EVENT_NAME);
  expect(await form.evaluate((node) => Math.round(node.getBoundingClientRect().height))).toBe(step1Height);
  await form.getByRole("button", { name: "Next" }).click();
  await expect(section.locator("#support-volunteers-qty")).toHaveValue("3");

  const created = agent.waitForResponse((r) => r.url().endsWith("/api/exhibitions") && r.request().method() === "POST");
  await form.getByRole("button", { name: /submit request/i }).click();
  const createdRes = await created;
  expect(createdRes.status()).toBe(201);
  const createdBody = await createdRes.json();
  requestId = String(createdBody._id ?? createdBody.item?._id);
  const stored = (createdBody.supportItems ?? createdBody.item?.supportItems) as Array<Record<string, unknown>>;
  expect(stored.map((s) => [s.item, s.requestedQty, s.allocatedQty ?? null])).toEqual([
    ["tv", 1, null],
    ["volunteers", 3, null],
    ["other", 1, null],
  ]);
  expect(stored[2].label).toBe("Projector screen");
  await expect(form).toBeHidden();

  // Agent detail shows what was requested.
  await agent.getByText(EVENT_NAME).first().click();
  const agentDetail = agent.getByRole("dialog").filter({ hasText: EVENT_NAME });
  await expect(agentDetail.getByText("Other: Projector screen")).toBeVisible();
  await expect(agentDetail.getByText("Two power sockets near the booth.")).toBeVisible();
  await agent.screenshot({ path: `${SHOTS}/02-agent-detail.png` });
  // Two more for the review steps: no date and no budget (" R", to reject) and
  // one to send back for changes (" V").
  for (const suffix of [" R", " V"]) {
    const extra = await api(agent, "POST", "/api/exhibitions", {
      eventName: `${EVENT_NAME}${suffix}`,
      eventCategory: "job_fair",
      supportItems: [{ item: "visiting_cards", requestedQty: 500 }],
    });
    expect(extra.status, JSON.stringify(extra.json)).toBe(201);
    extraIds.push(String(extra.json?._id));
  }
  await agent.context().close();

  /* ── 2. Super agent: date columns, sort, support on the row ───────── */
  const sa = await login(browser, SUPER_AGENT);
  await sa.goto("/en/super-agent/exhibitions", { waitUntil: "networkidle" });
  const head = sa.getByRole("table").first();
  await expect(head.getByRole("columnheader", { name: /exhibition date/i })).toBeVisible();
  await expect(head.getByRole("columnheader", { name: /created/i })).toBeVisible();

  // Sort by exhibition date: soonest first, undated last; the URL carries it.
  const sorted = sa.waitForResponse((r) => r.url().includes("/api/exhibitions?") && r.url().includes("sortBy=eventStartDate"));
  await head.getByRole("button", { name: /exhibition date/i }).click();
  const byDate = await (await sorted).json();
  await expect(sa).toHaveURL(/sortBy=eventStartDate/);
  const dates = (byDate.items as Array<{ eventStartDate?: string }>).map((i) => i.eventStartDate ?? null);
  const firstUndated = dates.indexOf(null);
  if (firstUndated >= 0) expect(dates.slice(firstUndated).every((d) => d === null)).toBe(true);
  const dated = dates.filter(Boolean) as string[];
  expect([...dated].sort()).toEqual(dated);
  await sa.screenshot({ path: `${SHOTS}/03-sa-sorted-by-exhibition-date.png` });

  // Toggle to descending (undated still last), then sort by created.
  const desc = sa.waitForResponse((r) => r.url().includes("sortBy=eventStartDate") && r.url().includes("sortOrder=desc"));
  await head.getByRole("button", { name: /exhibition date/i }).click();
  const byDateDesc = await (await desc).json();
  const descDates = (byDateDesc.items as Array<{ eventStartDate?: string }>).map((i) => i.eventStartDate ?? null);
  const descUndated = descDates.indexOf(null);
  if (descUndated >= 0) expect(descDates.slice(descUndated).every((d) => d === null)).toBe(true);
  const descDated = descDates.filter(Boolean) as string[];
  expect([...descDated].sort().reverse()).toEqual(descDated);
  const byCreated = sa.waitForResponse((r) => r.url().includes("/api/exhibitions?") && r.url().includes("sortBy=createdAt"));
  await head.getByRole("button", { name: /created/i }).click();
  const createdOrder = await (await byCreated).json();
  const createdDates = (createdOrder.items as Array<{ createdAt: string }>).map((i) => i.createdAt);
  expect([...createdDates].sort().reverse()).toEqual(createdDates);

  // Sorting holds across pages with a filter on: page 1 then page 2 of the
  // awaiting-review queue by exhibition date, two per page, no overlap, in order.
  const pageOf = async (n: number) =>
    (await api(sa, "GET", `/api/exhibitions?status=pending_review&sortBy=eventStartDate&sortOrder=asc&limit=2&page=${n}`)).json as {
      items: Array<{ _id: string; status: string; eventStartDate?: string }>;
      total: number;
    };
  const p1 = await pageOf(1);
  const p2 = await pageOf(2);
  expect(p1.total).toBeGreaterThanOrEqual(3);
  expect(p1.items.map((i) => i._id).filter((id) => p2.items.some((j) => j._id === id))).toEqual([]);
  const joined = [...p1.items, ...p2.items];
  expect(joined.every((i) => ["submitted", "under_review"].includes(i.status))).toBe(true);
  const joinedDates = joined.map((i) => i.eventStartDate ?? null);
  const joinedUndated = joinedDates.indexOf(null);
  if (joinedUndated >= 0) expect(joinedDates.slice(joinedUndated).every((d) => d === null)).toBe(true);
  const joinedDated = joinedDates.filter(Boolean) as string[];
  expect([...joinedDated].sort()).toEqual(joinedDated);

  // The "Awaiting your review" figure filters the queue; clicking it again clears it.
  const awaitingFigure = sa.getByRole("button", { name: /awaiting your review/i });
  const awaitingCount = Number((await awaitingFigure.innerText()).match(/\d+/)?.[0] ?? -1);
  const filtered = sa.waitForResponse((r) => r.url().includes("/api/exhibitions?") && r.url().includes("status=pending_review"));
  await awaitingFigure.click();
  const filteredBody = await (await filtered).json();
  await expect(sa).toHaveURL(/status=pending_review/);
  expect(filteredBody.total).toBe(awaitingCount);
  expect((filteredBody.items as Array<{ status: string }>).every((i) => ["submitted", "under_review"].includes(i.status))).toBe(true);
  await sa.screenshot({ path: `${SHOTS}/03b-sa-awaiting-filter.png` });
  await awaitingFigure.click();
  await expect(sa).not.toHaveURL(/status=pending_review/);

  // Our request: requested resources as chips on the row.
  await sa.getByPlaceholder(/search/i).first().fill(EVENT_NAME);
  const row = sa.getByRole("row").filter({ hasText: EVENT_NAME }).filter({ hasNotText: `${EVENT_NAME} R` }).filter({ hasNotText: `${EVENT_NAME} V` });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText("TV × 1")).toBeVisible();
  await expect(row.getByText("Volunteers × 3")).toBeVisible();
  await expect(row.getByText("+1 more")).toBeVisible();
  await expect(row.getByText(next.toLocaleDateString("en", { month: "short", day: "numeric" }), { exact: false }).first()).toBeVisible();
  // The undated, budget-less request says so instead of "USD 0".
  const undatedRow = sa.getByRole("row").filter({ hasText: `${EVENT_NAME} R` });
  await expect(undatedRow.getByText("Date not confirmed")).toBeVisible();
  await expect(undatedRow.getByText("Not specified")).toBeVisible();
  await sa.screenshot({ path: `${SHOTS}/04-sa-row.png` });

  // Detail: requested vs allocated vs delivered (nothing allocated yet), the
  // history with who did it, and the actions this status allows.
  await row.getByRole("button", { name: EVENT_NAME }).click();
  const saDetail = sa.getByRole("dialog").filter({ hasText: EVENT_NAME });
  await expect(saDetail.getByRole("heading", { name: "Requested resources" })).toBeVisible();
  const volunteerLine = saDetail.getByRole("row").filter({ hasText: "Volunteers (people)" });
  await expect(volunteerLine.getByRole("cell").nth(1)).toHaveText("3");
  await expect(volunteerLine.getByRole("cell").nth(2)).toHaveText("—");
  await expect(volunteerLine.getByRole("cell").nth(3)).toHaveText("—");
  await expect(saDetail.getByText("Two power sockets near the booth.")).toBeVisible();
  await expect(saDetail.getByText("Not decided yet").first()).toBeVisible();
  await expect(saDetail.getByRole("button", { name: "Start Review" })).toBeVisible();
  await expect(saDetail.getByRole("button", { name: "Reject" })).toBeVisible();
  await expect(saDetail.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await sa.screenshot({ path: `${SHOTS}/05-sa-detail.png` });

  // Start review from the detail footer.
  await saDetail.getByRole("button", { name: "Start Review" }).click();
  const startDialog = sa.getByRole("dialog", { name: "Start Review" });
  await startDialog.getByRole("button", { name: "Start Review" }).click();
  await expect(startDialog).toBeHidden();
  await expect(row.getByText("Under Review")).toBeVisible({ timeout: 20_000 });

  // Approve from the row: the dialog says approval does not allocate.
  await row.getByRole("button", { name: /approve/i }).click();
  const approveDialog = sa.getByRole("dialog", { name: "Approve Exhibition" });
  await expect(approveDialog.getByText(/doesn't allocate the requested resources/)).toBeVisible();
  await approveDialog.getByLabel("Review Notes").fill("Fits the Q4 plan");
  await sa.screenshot({ path: `${SHOTS}/05c-sa-approve-dialog.png` });
  await approveDialog.getByRole("button", { name: "Approve" }).click();
  await expect(approveDialog).toBeHidden();
  await expect(row.getByText("Operationally Approved")).toBeVisible({ timeout: 20_000 });

  // Approval stored, nothing allocated or delivered, history appended with actors.
  const approved = (await api(sa, "GET", `/api/exhibitions/${requestId}`)).json as {
    status: string;
    supportItems: Array<Record<string, unknown>>;
    statusHistory: Array<{ status: string; approverRole?: string; note?: string; changedBy?: { name?: string } }>;
  };
  expect(approved.status).toBe("approved");
  expect(approved.supportItems.every((s) => s.allocatedQty == null && (s.deliveryStatus ?? "pending") === "pending")).toBe(true);
  expect(approved.statusHistory.map((h) => h.status)).toEqual(["submitted", "under_review", "approved"]);
  expect(approved.statusHistory[2]).toMatchObject({ approverRole: "super_agent", note: "Fits the Q4 plan" });
  expect(approved.statusHistory[2].changedBy?.name).toBeTruthy();

  // Nothing left for this role to do on it, and the server agrees.
  await row.getByRole("button", { name: EVENT_NAME }).click();
  const approvedDetail = sa.getByRole("dialog").filter({ hasText: EVENT_NAME });
  await expect(approvedDetail.getByText("Fits the Q4 plan")).toBeVisible();
  await expect(approvedDetail.getByText(approved.statusHistory[2].changedBy!.name!).first()).toBeVisible();
  await expect(approvedDetail.getByRole("button", { name: /approve|reject|start review/i })).toHaveCount(0);
  await approvedDetail.getByText("Approval History").scrollIntoViewIfNeeded();
  await sa.screenshot({ path: `${SHOTS}/05d-sa-history.png` });
  await approvedDetail.getByRole("button", { name: "Close" }).last().click();
  await expect(approvedDetail).toBeHidden();
  const again = await api(sa, "PATCH", `/api/exhibitions/${requestId}`, { status: "approved" });
  expect(again.status).toBe(409);
  // A super agent cannot touch allocation.
  expect((await api(sa, "PATCH", `/api/exhibitions/${requestId}/support`, { action: "allocate", items: [] })).status).toBe(403);

  // Reject needs a reason: the button stays disabled until one is given.
  // A new submission's only extra action is Reject, so it is a button of its own (no "…").
  await undatedRow.getByRole("button", { name: "Reject" }).click();
  const rejectDialog = sa.getByRole("dialog", { name: "Reject Exhibition" });
  await expect(rejectDialog.getByRole("button", { name: "Reject" })).toBeDisabled();
  await rejectDialog.getByLabel(/reason for rejecting/i).fill("Duplicate of the main request");
  await rejectDialog.getByRole("button", { name: "Reject" }).click();
  await expect(rejectDialog).toBeHidden();
  await expect(undatedRow.getByText("Rejected")).toBeVisible({ timeout: 20_000 });

  // Request changes on the third one, after starting its review.
  const reviseRow = sa.getByRole("row").filter({ hasText: `${EVENT_NAME} V` });
  await reviseRow.getByRole("button", { name: /review/i }).click();
  await sa.getByRole("dialog", { name: "Start Review" }).getByRole("button", { name: "Start Review" }).click();
  await expect(reviseRow.getByText("Under Review")).toBeVisible({ timeout: 20_000 });
  await reviseRow.getByRole("button", { name: /more actions/i }).click();
  await sa.getByRole("menuitem", { name: "Revise" }).click();
  const reviseDialog = sa.getByRole("dialog", { name: "Request Revision" });
  await expect(reviseDialog.getByRole("button", { name: "Request Revision" })).toBeDisabled();
  await reviseDialog.getByLabel(/revision notes/i).fill("Add the venue and dates");
  await reviseDialog.getByRole("button", { name: "Request Revision" }).click();
  await expect(reviseDialog).toBeHidden();
  await expect(reviseRow.getByText("Revision Requested")).toBeVisible({ timeout: 20_000 });

  // All three survive a reload.
  await sa.reload({ waitUntil: "networkidle" });
  await expect(row.getByText("Operationally Approved")).toBeVisible({ timeout: 20_000 });
  await expect(undatedRow.getByText("Rejected")).toBeVisible();
  await expect(reviseRow.getByText("Revision Requested")).toBeVisible();
  const rejected = (await api(sa, "GET", `/api/exhibitions/${extraIds[0]}`)).json as { statusHistory: Array<{ status: string; statusReason?: string }> };
  expect(rejected.statusHistory.at(-1)).toMatchObject({ status: "rejected", statusReason: "Duplicate of the main request" });
  await sa.screenshot({ path: `${SHOTS}/05e-sa-after-reload.png` });

  // Phones (and tablets below 1280px): one card per request with both dates,
  // the requested support and the actions; sorting moves into the filter row.
  await sa.setViewportSize({ width: 390, height: 860 });
  await sa.reload({ waitUntil: "networkidle" });
  const card = sa.getByRole("listitem").filter({ hasText: EVENT_NAME }).filter({ hasText: "TV × 1" }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Exhibition date")).toBeVisible();
  await expect(card.getByText("Created")).toBeVisible();
  await expect(card.getByText("Volunteers × 3")).toBeVisible();
  await expect(sa.getByRole("combobox", { name: "Sort" })).toBeVisible();
  const figureTops = await sa.locator("[data-header-metric]").evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().top)));
  expect(figureTops).toHaveLength(5);
  expect(new Set(figureTops).size).toBe(1);
  await expect(sa.locator("[data-header-metric]").filter({ hasText: "To review" })).toBeVisible();
  expect(await sa.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await sa.screenshot({ path: `${SHOTS}/05b-sa-phone-card.png` });
  await sa.setViewportSize({ width: 1440, height: 900 });
  await sa.context().close();

  /* ── 2b. Agent: the request sent back for changes ─────────────────── */
  const agentAgain = await login(browser, AGENT);
  await agentAgain.goto("/en/agent/exhibitions", { waitUntil: "networkidle" });
  await agentAgain.getByText(`${EVENT_NAME} V`).first().click();
  const sentBack = agentAgain.getByRole("dialog").filter({ hasText: `${EVENT_NAME} V` });
  await expect(sentBack.getByText("Changes requested")).toBeVisible();
  await expect(sentBack.getByText("Add the venue and dates")).toBeVisible();
  await expect(sentBack.getByText("Date not confirmed")).toBeVisible();
  await expect(sentBack.getByText("Not specified").first()).toBeVisible();
  await expect(sentBack.getByText("$ 0")).toHaveCount(0);
  await expect(sentBack.getByText("TBD")).toHaveCount(0);
  await expect(sentBack.getByRole("button", { name: "Edit and resubmit" })).toBeVisible();
  // History names who sent it back, not just the role.
  const saName = String(approved.statusHistory[2].changedBy?.name);
  await expect(sentBack.getByText(saName).first()).toBeVisible();
  await agentAgain.screenshot({ path: `${SHOTS}/05f-agent-sent-back-detail.png` });
  await agentAgain.context().close();

  /* ── 3. Admin: allocate, move to Delivery, record delivery ────────── */
  const admin = await login(browser, ADMIN);
  await admin.goto("/en/admin/exhibitions", { waitUntil: "networkidle" });
  const budget = await api(admin, "PATCH", `/api/exhibitions/${requestId}`, { status: "budget_approved", approvedBudget: 1000, reviewNote: "Budget OK" });
  expect(budget.status, JSON.stringify(budget.json)).toBe(200);

  await admin.getByPlaceholder(/search/i).first().fill(EVENT_NAME);
  const adminRow = admin.getByRole("row").filter({ hasText: EVENT_NAME }).filter({ hasNotText: `${EVENT_NAME} R` }).filter({ hasNotText: `${EVENT_NAME} V` });
  await expect(adminRow).toBeVisible({ timeout: 20_000 });
  await adminRow.getByText(EVENT_NAME).first().click();
  const inspector = admin.getByRole("complementary", { name: /inspector/i });
  await expect(inspector.getByRole("heading", { name: /support & inventory/i })).toBeVisible();
  await expect(inspector.getByText("Not allocated")).toBeVisible();
  await inspector.getByRole("heading", { name: /support & inventory/i }).scrollIntoViewIfNeeded();
  await admin.screenshot({ path: `${SHOTS}/06-admin-inspector-requested.png` });

  // Over-allocation is refused by the server and the dialog says why.
  await inspector.getByRole("button", { name: "Allocate resources" }).click();
  const allocate = admin.getByRole("dialog", { name: "Allocate resources" });
  await allocate.locator("#alloc-0").fill("5");
  await allocate.getByRole("button", { name: "Save allocation" }).click();
  await expect(allocate.getByRole("alert")).toContainText("Allocate between 0 and 1 for TV");
  await admin.screenshot({ path: `${SHOTS}/07-admin-over-allocation-refused.png` });

  // Partial: TV 1/1, volunteers 2/3, projector 1/1.
  await allocate.locator("#alloc-0").fill("1");
  await allocate.locator("#person-0").fill("Store team");
  await allocate.locator("#alloc-1").fill("2");
  await allocate.locator("#person-1").fill("Rashid");
  await allocate.locator("#alloc-2").fill("1");
  await admin.screenshot({ path: `${SHOTS}/08-admin-allocate-dialog.png` });
  await allocate.getByRole("button", { name: "Save allocation" }).click();
  await expect(allocate).toBeHidden();
  await expect(inspector.getByText("Partially allocated")).toBeVisible();
  await expect(inspector.getByText("1 item short")).toBeVisible();
  await expect(inspector.getByText("Responsible: Rashid")).toBeVisible();
  await admin.screenshot({ path: `${SHOTS}/09-admin-partially-allocated.png` });

  // Moving to Delivery warns (not everything allocated) but is allowed.
  await inspector.getByRole("button", { name: "Assign Resources" }).click();
  const move = admin.getByRole("dialog").filter({ hasText: "isn't fully allocated yet" });
  await expect(move).toBeVisible();
  await admin.screenshot({ path: `${SHOTS}/10-admin-assign-warning.png` });
  await move.getByRole("textbox").last().fill("Volunteer shortfall accepted");
  await move.getByRole("button", { name: /assign resources|confirm/i }).last().click();
  await expect(move).toBeHidden({ timeout: 20_000 });

  // Delivery: an issue without a note is refused.
  await adminRow.getByText(EVENT_NAME).first().click();
  await inspector.getByRole("button", { name: "Update delivery" }).click();
  const delivery = admin.getByRole("dialog", { name: "Update delivery" });
  const statusFor = (name: string) => delivery.getByRole("combobox", { name: `Delivery status: ${name}` });
  await statusFor("TV").click();
  await admin.screenshot({ path: `${SHOTS}/11a-delivery-select-open.png` });
  await admin.getByRole("option", { name: "Delivered", exact: true }).click();
  await delivery.locator("#dqty-0").fill("1");
  await statusFor("Volunteers (people)").click();
  await admin.getByRole("option", { name: "Issue", exact: true }).click();
  await delivery.getByRole("button", { name: "Save delivery" }).click();
  await expect(delivery.getByRole("alert")).toContainText("what went wrong with Volunteers");
  await delivery.locator("#dnote-1").fill("Only 2 volunteers confirmed");
  await admin.screenshot({ path: `${SHOTS}/11-admin-delivery-dialog.png` });
  await delivery.getByRole("button", { name: "Save delivery" }).click();
  await expect(delivery).toBeHidden();
  await expect(inspector.getByText("Delivery issue")).toBeVisible();
  await expect(inspector.getByText("Only 2 volunteers confirmed")).toBeVisible();
  await admin.screenshot({ path: `${SHOTS}/12-admin-delivery-recorded.png` });

  // Survives a reload; the history records both changes.
  const after = await api(admin, "GET", `/api/exhibitions/${requestId}`);
  const doc = (after.json?.item ?? after.json) as { status: string; supportItems: Array<Record<string, unknown>>; statusHistory: Array<{ note?: string }> };
  expect(doc.status).toBe("resources_assigned");
  expect(doc.supportItems.map((s) => [s.item, s.allocatedQty, s.deliveryStatus, s.deliveredQty ?? null])).toEqual([
    ["tv", 1, "delivered", 1],
    ["volunteers", 2, "issue", null],
    ["other", 1, "pending", null],
  ]);
  const notes = doc.statusHistory.map((h) => h.note ?? "");
  expect(notes.some((n) => n.startsWith("Allocation updated"))).toBe(true);
  expect(notes.some((n) => n.startsWith("Delivery updated"))).toBe(true);

  await admin.reload({ waitUntil: "networkidle" });
  await admin.getByPlaceholder(/search/i).first().fill(EVENT_NAME);
  await adminRow.getByText(EVENT_NAME).first().click();
  await expect(inspector.getByText("Partially allocated")).toBeVisible();
  await expect(inspector.getByText("Delivery issue")).toBeVisible();
  await admin.screenshot({ path: `${SHOTS}/13-admin-after-reload.png` });
  await admin.context().close();
});

test.afterAll(async ({ browser }) => {
  const ids = [requestId, ...extraIds].filter(Boolean);
  if (ids.length === 0) return;
  const admin = await login(browser, ADMIN);
  await admin.goto("/en/admin/exhibitions", { waitUntil: "domcontentloaded" });
  for (const id of ids) await api(admin, "DELETE", `/api/exhibitions/${id}`);
  await admin.context().close();
});
