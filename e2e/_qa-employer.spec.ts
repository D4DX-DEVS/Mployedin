import { test } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { watch, flush, shot, login, pickSelect, bodyText, layoutProbe, log, SHOTS } from "./_qa-emp-helpers";

const TS = process.env.QA_TS ?? String(Date.now());
const STATE = path.join(SHOTS, "_state.json");
const readState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {});
const writeState = (o: Record<string, unknown>) => fs.writeFileSync(STATE, JSON.stringify({ ...readState(), ...o }, null, 1));

test.describe.configure({ mode: "default" });
test.setTimeout(900_000);

test("01 register", async ({ page }) => {
  const iss = watch(page);
  const email = `qa-emp-${TS}@example.com`;
  const pw = "QaTest@12345";
  writeState({ regEmail: email, regPw: pw, company: `QA Test Co ${TS}` });
  for (let k = 0; k < 3; k++) { try { await page.goto("/en/employer-register", { waitUntil: "load", timeout: 90000 }); break; } catch { await page.waitForTimeout(5000); } }
  await page.waitForTimeout(1000);
  await shot(page, "01-register-step1-empty");
  // empty next
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, "01-register-step1-validation");
  log({ label: "reg-step1-validation", text: await bodyText(page) });
  await page.locator('[data-registration-field="companyName"] input').fill(`QA Test Co ${TS}`);
  await pickSelect(page.locator('[data-registration-field="industry"]'), page);
  await pickSelect(page.locator('[data-registration-field="size"]'), page);
  await page.locator('[data-registration-field="website"] input').fill("not a url");
  await pickSelect(page.locator('[data-registration-field="country"]'), page, /Emirates/i).catch(() => pickSelect(page.locator('[data-registration-field="country"]'), page));
  await page.locator('[data-registration-field="city"] input').fill("Dubai");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, "01-register-step1-badwebsite");
  log({ label: "reg-step1-badwebsite", text: await bodyText(page) });
  await page.locator('[data-registration-field="website"] input').fill("qa-example.com");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(700);
  await shot(page, "01-register-step2");
  log({ label: "reg-step2", text: await bodyText(page) });
  // choose first radio (basic)
  const radios = page.locator('input[name="verLevel"]');
  log({ label: "reg-radios", n: await radios.count() });
  await radios.first().check({ force: true }).catch(() => {});
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(700);
  await shot(page, "01-register-step3-empty");
  // submit empty
  await page.getByRole("button", { name: /complete registration/i }).click();
  await page.waitForTimeout(700);
  await shot(page, "01-register-step3-validation");
  log({ label: "reg-step3-validation", text: await bodyText(page) });
  const s3 = page.locator("input");
  const inputs = await s3.evaluateAll((els) => els.map((e) => ({ type: (e as HTMLInputElement).type, ph: (e as HTMLInputElement).placeholder, id: e.id })));
  log({ label: "reg-step3-inputs", inputs });
  const byPh = async (re: RegExp, v: string) => {
    const i = inputs.findIndex((x) => re.test(x.ph));
    if (i >= 0) await s3.nth(i).fill(v);
    else log({ label: "missing-input", re: String(re) });
  };
  await byPh(/John|name/i, "QA Owner");
  await byPh(/manager|title|role|position/i, "Head of QA");
  await byPh(/@|email/i, email);
  await byPh(/\+|phone/i, "+971500000001");
  const pwIdx = inputs.map((x, i) => (x.type === "password" ? i : -1)).filter((i) => i >= 0);
  await s3.nth(pwIdx[0]).fill("weak");
  await s3.nth(pwIdx[1]).fill("weak2");
  await page.getByRole("button", { name: /complete registration/i }).click();
  await page.waitForTimeout(700);
  await shot(page, "01-register-step3-weakpw");
  log({ label: "reg-step3-weakpw", text: await bodyText(page) });
  await s3.nth(pwIdx[0]).fill(pw);
  await s3.nth(pwIdx[1]).fill(pw);
  await page.locator("#employer-terms").check({ force: true });
  await shot(page, "01-register-step3-filled");
  await page.getByRole("button", { name: /complete registration/i }).click();
  await page.waitForURL(/verify-email|login|employer|onboarding/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "01-register-after-submit");
  log({ label: "reg-after-submit", url: page.url(), text: await bodyText(page) });
  flush(iss, "01 register");

  // login BEFORE verifying
  const okUnverified = await login(page, email, pw);
  await page.waitForTimeout(1500);
  await shot(page, "01-login-unverified");
  log({ label: "login-unverified", ok: okUnverified, url: page.url(), text: await bodyText(page) });
  flush(iss, "01 login unverified");

  log({ label: "db-verify", out: execSync(`node scripts/qa/_db.mjs verify-email ${email}`, { cwd: path.resolve(__dirname, "..") }).toString() });
  await page.context().clearCookies();
  const ok = await login(page, email, pw);
  await page.waitForTimeout(3000);
  await shot(page, "01-first-login");
  log({ label: "first-login", ok, url: page.url(), text: await bodyText(page), probe: await layoutProbe(page) });
  flush(iss, "01 first login");
});

const EMP = { email: "employer@mployedin.com", pw: "Employer@1234" };
const ROUTES = ["", "activity-history", "analytics", "applications", "assessments", "background-checks", "calendar", "campaigns", "candidates", "comm-templates", "interviews", "interviews/bulk", "invoices", "jobs", "jobs/new", "jobs/ai-create", "jobs/ai-extract", "job-templates", "matching-weights", "messages", "my-posters", "offers", "payment-setup", "placements", "scorecards", "screening-analytics", "settings", "subscription", "talent-pools", "team", "team/activity-logs", "workflow"];

async function visit(page: import("@playwright/test").Page, iss: ReturnType<typeof watch>, url: string, name: string, full = true) {
  const t0 = Date.now();
  let status: number | null = null;
  try {
    const r = await page.goto(url, { waitUntil: "load", timeout: 90000 });
    status = r?.status() ?? null;
  } catch (e) { log({ label: name, gotoError: String(e).slice(0, 200) }); }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const spinners = await page.locator('[class*="animate-spin"], [class*="skeleton"], [class*="animate-pulse"]').count().catch(() => -1);
  await shot(page, name, full);
  const probe = await layoutProbe(page);
  const text = await bodyText(page);
  const errs = flush(iss, name);
  log({ label: `visit:${name}`, url: page.url(), status, ms: Date.now() - t0, spinners, probe, text: text.slice(0, 900), errs });
}

test("01b register submit error ui", async ({ page }) => {
  const iss = watch(page);
  await page.goto("/en/employer-register", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.locator('[data-registration-field="companyName"] input').fill(`QA Test Co ${TS}b`);
  await pickSelect(page.locator('[data-registration-field="industry"]'), page);
  await pickSelect(page.locator('[data-registration-field="size"]'), page);
  await page.locator('[data-registration-field="city"] input').fill("Dubai");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(500);
  // try the Standard level to see upload UX
  await page.locator('input[name="verLevel"]').nth(1).check({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "01b-register-step2-standard");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, "01b-register-step2-standard-validation");
  log({ label: "reg-standard-next", text: (await bodyText(page)).slice(-600) });
  await page.locator('input[name="verLevel"]').first().check({ force: true }).catch(() => {});
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(500);
  const s3 = page.locator("input");
  await s3.nth(0).fill("QA Owner");
  await page.locator('input[type=email]').fill(`qa-emp-${TS}b@example.com`);
  await page.locator('input[type=password]').nth(0).fill("QaTest@12345");
  await page.locator('input[type=password]').nth(1).fill("QaTest@12345");
  await page.locator("#employer-terms").check({ force: true });
  await page.getByRole("button", { name: /complete registration/i }).click();
  await page.waitForTimeout(3000);
  await shot(page, "01b-register-submitting", false);
  await page.waitForTimeout(8000);
  await shot(page, "01b-register-submit-result");
  log({ label: "reg-submit-result", url: page.url(), text: (await bodyText(page)).slice(-700) });
  flush(iss, "01b register submit");
});

test("02 dashboard sweep", async ({ page }) => {
  test.setTimeout(1_800_000);
  const iss = watch(page);
  const ok = await login(page, EMP.email, EMP.pw);
  await page.waitForTimeout(2000);
  log({ label: "seed-login", ok, url: page.url() });
  await shot(page, "02-after-login");
  flush(iss, "02 login");
  // sidebar links
  const links = await page.locator("aside a, nav a").evaluateAll((els) => els.map((e) => `${(e as HTMLElement).innerText.trim().replace(/\s+/g, " ")} -> ${(e as HTMLAnchorElement).getAttribute("href")}`));
  log({ label: "sidebar-links", links });
  for (const r of ROUTES) {
    const name = "02-" + (r ? r.replace(/\//g, "_") : "dashboard");
    await visit(page, iss, `/en/employer${r ? "/" + r : ""}`, name);
  }
});

async function seedLogin(page: import("@playwright/test").Page) {
  const ok = await login(page, EMP.email, EMP.pw);
  log({ label: "seed-login", ok, url: page.url() });
  return ok;
}
async function buttons(page: import("@playwright/test").Page) {
  return page.locator("main button:visible, main a[role=button]:visible").evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 60));
}
async function clickBtn(page: import("@playwright/test").Page, name: RegExp) {
  const b = page.locator("button:visible, [role=menuitem]:visible").filter({ hasText: name }).first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(1500); return true; }
  return false;
}

test("03 job post flow", async ({ page }) => {
  test.setTimeout(900_000);
  const iss = watch(page);
  await seedLogin(page);
  const title = `qa-QA Engineer ${TS}`;
  writeState({ jobTitle: title });
  await visit(page, iss, "/en/employer/jobs/new", "03-jobs-new-chooser");
  await visit(page, iss, "/en/employer/jobs/new?mode=manual", "03-wizard-step1-empty");
  await clickBtn(page, /^\s*Next/);
  await shot(page, "03-wizard-step1-validation");
  log({ label: "wiz-step1-validation", text: (await bodyText(page)).slice(0, 1500) });
  await page.locator('input[name="title"]').fill(title);
  const catCombo = page.locator("div").filter({ has: page.locator("label", { hasText: /^Category/ }) }).locator('[role="combobox"]').first();
  if (await catCombo.count()) { await catCombo.click(); await page.locator('[role="option"]').filter({ hasText: /Tech|IT|Engineer|Software/i }).first().click().catch(async () => page.locator('[role="option"]').first().click()); }
  await page.locator('input[name="location.city"]').fill("Dubai").catch(() => log({ label: "no-city" }));
  const cc = page.locator('[role="combobox"]').filter({ hasText: /Select country/i }).first();
  if (await cc.count()) { await cc.click(); await page.keyboard.type("United Arab"); await page.waitForTimeout(600); await page.locator('[role="option"]').filter({ hasText: /United Arab Emirates/ }).first().click().catch(() => page.locator('[role="option"]').first().click()); }
  await page.waitForTimeout(500);
  await page.waitForTimeout(800);
  await shot(page, "03-wizard-step1-filled");
  await clickBtn(page, /^\s*Next/);
  await shot(page, "03-wizard-step2");
  log({ label: "wiz-step2", text: (await bodyText(page)).slice(0, 1200) });
  await page.locator('textarea[name="description"], [contenteditable=true]').first().fill("qa- We are hiring a QA Engineer to own test automation (Playwright), exploratory testing and release quality for our Gulf recruitment platform. You will work with product and engineering to prevent regressions.");
  const saved = await clickBtn(page, /Save draft/i);
  await page.waitForTimeout(2500);
  await shot(page, "03-wizard-draft-saved", false);
  log({ label: "wiz-draft", saved, url: page.url(), text: (await bodyText(page)).slice(0, 600) });
  flush(iss, "03 draft");
  await clickBtn(page, /^\s*Next/);
  await shot(page, "03-wizard-step3");
  await clickBtn(page, /^\s*Next/);
  await shot(page, "03-wizard-step4");
  log({ label: "wiz-step4", text: (await bodyText(page)).slice(0, 1200) });
  await page.locator('input[name="salary.min"]').fill("12000").catch(() => {});
  await page.locator('input[name="salary.max"]').fill("18000").catch(() => {});
  await clickBtn(page, /^\s*Next/);
  await shot(page, "03-wizard-step5");
  flush(iss, "03 steps");
  const posted = await clickBtn(page, /Post job|Publish/i);
  await page.waitForTimeout(6000);
  await shot(page, "03-wizard-after-post");
  log({ label: "wiz-post", posted, url: page.url(), text: (await bodyText(page)).slice(0, 1200) });
  flush(iss, "03 post");
  // jobs list
  await visit(page, iss, "/en/employer/jobs", "03-jobs-list-after");
  const link = page.locator(`a:has-text("${title}")`).first();
  const href = await link.getAttribute("href").catch(() => null);
  log({ label: "job-link", href });
  const idm = href?.match(/jobs\/([a-f0-9]{24})/);
  if (idm) {
    const id = idm[1];
    writeState({ jobId: id });
    await visit(page, iss, `/en/employer/jobs/${id}`, "03-job-detail-employer");
    log({ label: "job-detail-buttons", b: await buttons(page) });
    await visit(page, iss, `/en/employer/jobs/${id}/edit`, "03-job-edit");
    const t2 = page.locator('input[name="title"]');
    if (await t2.count()) {
      await t2.fill(title + " (edited)");
      const s = (await clickBtn(page, /Save changes|Update|Save/i));
      await page.waitForTimeout(3000);
      await shot(page, "03-job-edit-saved");
      log({ label: "job-edit", s, url: page.url(), text: (await bodyText(page)).slice(0, 500) });
    }
    await visit(page, iss, `/en/employer/jobs/${id}`, "03-job-detail-2");
    for (const [n, re] of [["pause", /^\s*Pause/i], ["resume", /Resume|Activate|Reopen/i], ["close", /^\s*Close( job)?\s*$/i]] as const) {
      let did = await clickBtn(page, re);
      if (!did) { await page.locator('button[aria-haspopup="menu"]:visible').first().click().catch(() => {}); await page.waitForTimeout(600); await shot(page, `03-job-menu-${n}`, false); log({ label: `menu-${n}`, items: await page.locator("[role=menuitem]").allInnerTexts().catch(() => []) }); did = await clickBtn(page, re); }
      await page.waitForTimeout(800);
      const dlg = page.locator('[role="alertdialog"], [role="dialog"]');
      if (await dlg.count()) { await shot(page, `03-job-${n}-dialog`, false); await dlg.locator("button").filter({ hasText: /confirm|pause|close|yes|resume|continue/i }).last().click().catch(() => {}); }
      await page.waitForTimeout(2500);
      await shot(page, `03-job-${n}`, false);
      log({ label: `job-${n}`, did, text: (await bodyText(page)).slice(0, 400) });
      flush(iss, `03 ${n}`);
      if (n === "resume") {
        // public check while active
        await visit(page, iss, `/en/jobs?q=${encodeURIComponent("qa-QA Engineer " + TS)}`, "03-public-jobs-search");
        const pub = page.locator(`a:has-text("qa-QA Engineer ${TS}")`).first();
        log({ label: "public-found", n: await pub.count() });
        const ph = await pub.getAttribute("href").catch(() => null);
        if (ph) await visit(page, iss, ph, "03-public-job-detail");
        await visit(page, iss, `/en/employer/jobs/${id}`, "03-job-detail-3");
      }
    }
    await visit(page, iss, `/en/employer/jobs/${id}/applications`, "04-job-applications");
    log({ label: "apps-buttons", b: await buttons(page) });
  }
  await visit(page, iss, "/en/employer/applications", "04-applications-all");
  log({ label: "apps-all-buttons", b: await buttons(page) });
  const search = page.locator('main input[type="search"], main input[placeholder*="earch"]').first();
  if (await search.count()) { await search.fill("engineer with react experience"); await page.keyboard.press("Enter"); await page.waitForTimeout(4000); await shot(page, "04-applications-search"); log({ label: "apps-search", text: (await bodyText(page)).slice(0, 800) }); }
  const cb = page.locator('main [role="checkbox"], main input[type=checkbox]');
  log({ label: "apps-checkboxes", n: await cb.count() });
  if (await cb.count() > 1) { await cb.nth(1).click().catch(() => {}); await page.waitForTimeout(800); await shot(page, "04-applications-bulk", false); log({ label: "apps-bulk-bar", b: await buttons(page) }); }
  flush(iss, "04 apps");
});

test("05-07 team settings subscription", async ({ page }) => {
  test.setTimeout(900_000);
  const iss = watch(page);
  await seedLogin(page);
  await visit(page, iss, "/en/employer/team", "05-team");
  log({ label: "team-buttons", b: await buttons(page) });
  if (await clickBtn(page, /Invite/i)) {
    await shot(page, "05-team-invite-dialog", false);
    const dlg = page.locator('[role="dialog"]').last();
    log({ label: "invite-dialog", text: (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 800) });
    await dlg.locator("button").filter({ hasText: /send|invite/i }).last().click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "05-team-invite-validation", false);
    await dlg.locator('input[type=email], input[name*=mail]').first().fill(`qa-invite-${TS}@example.com`).catch(() => {});
    const nm = dlg.locator('input[name*=name i]');
    if (await nm.count()) await nm.first().fill("QA Invitee");
    await dlg.locator("button").filter({ hasText: /send|invite/i }).last().click().catch(() => {});
    await page.waitForTimeout(3500);
    await shot(page, "05-team-invite-result");
    log({ label: "invite-result", text: (await bodyText(page)).slice(0, 900) });
  }
  flush(iss, "05 invite");
  await visit(page, iss, "/en/employer/settings", "06-settings");
  const tabs = await page.locator('[role="tab"]').allInnerTexts().catch(() => []);
  log({ label: "settings-tabs", tabs, b: await buttons(page) });
  for (let i = 0; i < Math.min(tabs.length, 10); i++) {
    await page.locator('[role="tab"]').nth(i).click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, `06-settings-tab-${i}-${tabs[i].replace(/[^a-z0-9]+/gi, "_").slice(0, 20)}`);
    log({ label: `settings-tab-${i}`, name: tabs[i], text: (await bodyText(page)).slice(0, 700) });
  }
  flush(iss, "06 settings");
  await visit(page, iss, "/en/employer/subscription", "07-subscription");
  log({ label: "sub-buttons", b: await buttons(page) });
  const up = page.locator("main button:visible, main a:visible").filter({ hasText: /Upgrade|Choose|Subscribe|Select plan|Get started/i }).first();
  if (await up.count()) {
    await up.click().catch(() => {});
    await page.waitForTimeout(5000);
    await shot(page, "07-subscription-upgrade-click");
    log({ label: "upgrade-click", url: page.url(), text: (await bodyText(page)).slice(0, 800) });
  }
  flush(iss, "07 upgrade");
  await visit(page, iss, "/en/employer/payment-setup", "07-payment-setup");
});

test("08 mobile", async ({ page }) => {
  test.setTimeout(900_000);
  const iss = watch(page);
  await visit(page, iss, "/en/employer-register", "08-m-register");
  await seedLogin(page);
  for (const [r, n] of [["", "dashboard"], ["jobs", "jobs"], ["jobs/new?mode=manual", "jobs-new-step1"], ["applications", "applications"], ["settings", "settings"]]) {
    await visit(page, iss, `/en/employer${r ? "/" + r : ""}`, `08-m-${n}`);
  }
  const burger = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]').first();
  if (await burger.count()) { await burger.click(); await page.waitForTimeout(1000); await shot(page, "08-m-nav-open", false); }
});

test("09 arabic", async ({ page }) => {
  test.setTimeout(900_000);
  const iss = watch(page);
  await visit(page, iss, "/ar/employer-register", "09-ar-register");
  await seedLogin(page);
  for (const [r, n] of [["", "dashboard"], ["jobs/new", "jobs-new-chooser"], ["jobs/new?mode=manual", "jobs-new-step1"], ["jobs", "jobs"], ["settings", "settings"]]) {
    await visit(page, iss, `/ar/employer${r ? "/" + r : ""}`, `09-ar-${n}`);
    log({ label: `ar-${n}`, dir: await page.evaluate(() => document.documentElement.dir), lang: await page.evaluate(() => document.documentElement.lang), latin: await page.evaluate(() => { const t = document.querySelector("main")?.innerText ?? ""; return (t.match(/\b[A-Za-z][a-z]{3,}(?:\s+[A-Za-z][a-z]{2,}){1,}/g) || []).slice(0, 25); }) });
  }
});

test("03b job lifecycle", async ({ page }) => {
  test.setTimeout(600_000);
  const iss = watch(page);
  await seedLogin(page);
  const id = process.env.QA_JOB_ID!;
  const title = `qa-QA Engineer ${TS}`;
  await visit(page, iss, `/en/employer/jobs/${id}`, "03b-draft-detail");
  log({ label: "draft-buttons", b: await buttons(page) });
  const pub = page.locator("main button:visible, main a:visible").filter({ hasText: /^\s*Publish/ }).first();
  await pub.click().catch((e) => log({ label: "pub-click-err", e: String(e).slice(0, 120) }));
  await page.waitForTimeout(3000);
  await shot(page, "03b-after-publish-click", false);
  const dlg = page.locator('[role="alertdialog"], [role="dialog"]');
  if (await dlg.count()) { log({ label: "publish-dialog", text: (await dlg.first().innerText()).replace(/\s+/g, " ").slice(0, 600) }); await dlg.locator("button").filter({ hasText: /publish|confirm|yes/i }).last().click().catch(() => {}); await page.waitForTimeout(4000); }
  await shot(page, "03b-published", false);
  log({ label: "after-publish", url: page.url(), text: (await bodyText(page)).split("⌘ K").pop()!.slice(0, 700) });
  flush(iss, "03b publish");
  await visit(page, iss, `/en/jobs?q=${encodeURIComponent(title)}`, "03b-public-search");
  const pl = page.locator(`a:has-text("${title}")`).first();
  log({ label: "public-found", n: await page.locator(`a:has-text("${title}")`).count() });
  const ph = await pl.getAttribute("href").catch(() => null);
  if (ph) await visit(page, iss, ph, "03b-public-detail");
  // edit
  await visit(page, iss, `/en/employer/jobs/${id}/edit`, "03b-edit");
  log({ label: "edit-buttons", b: await buttons(page) });
  const t2 = page.locator('input[name="title"]');
  if (await t2.count()) {
    await t2.fill(title + " edited");
    const saveBtn = page.locator("button:visible").filter({ hasText: /Save changes|Update job|Save|Update/i }).last();
    log({ label: "edit-save-btn", txt: await saveBtn.innerText().catch(() => null) });
    await saveBtn.click().catch(() => {});
    await page.waitForTimeout(4000);
    await shot(page, "03b-edit-saved", false);
    log({ label: "edit-result", url: page.url(), text: (await bodyText(page)).split("⌘ K").pop()!.slice(0, 500) });
  }
  flush(iss, "03b edit");
  for (const [n, re] of [["pause", /^\s*Pause/i], ["resume", /Resume|Reopen|Activate|Unpause/i], ["close", /^\s*Close/i]] as const) {
    await visit(page, iss, `/en/employer/jobs/${id}`, `03b-detail-before-${n}`, false);
    let did = await clickBtn(page, re);
    if (!did) {
      const more = page.locator('main button[aria-haspopup="menu"]:visible, main button[aria-label*="more" i]:visible').first();
      await more.click().catch(() => {}); await page.waitForTimeout(700);
      log({ label: `menu-${n}`, items: await page.locator("[role=menuitem]").allInnerTexts().catch(() => []) });
      await shot(page, `03b-menu-${n}`, false);
      did = await clickBtn(page, re);
    }
    const d2 = page.locator('[role="alertdialog"], [role="dialog"]');
    if (await d2.count()) { await shot(page, `03b-${n}-dialog`, false); log({ label: `${n}-dialog`, text: (await d2.first().innerText()).replace(/\s+/g, " ").slice(0, 400) }); await d2.locator("button").filter({ hasText: /confirm|pause|close|yes|resume|reopen|continue/i }).last().click().catch(() => {}); }
    await page.waitForTimeout(3000);
    await shot(page, `03b-${n}`, false);
    log({ label: `job-${n}`, did, text: (await bodyText(page)).split("⌘ K").pop()!.slice(0, 300) });
    flush(iss, `03b ${n}`);
  }
  await visit(page, iss, `/en/employer/jobs/${id}/applications`, "04-job-applications");
  await visit(page, iss, "/en/employer/applications", "04-applications-all");
  const search = page.locator('main input[placeholder*="earch"]').first();
  if (await search.count()) { await search.fill("sales manager with B2B experience"); await clickBtn(page, /Ask AI/); await page.waitForTimeout(6000); await shot(page, "04-applications-ai-search", false); log({ label: "apps-ai", text: (await bodyText(page)).split("⌘ K").pop()!.slice(0, 700) }); }
  flush(iss, "04 ai search");
  await search.fill("").catch(() => {});
  await clickBtn(page, /^\s*Filters/); await shot(page, "04-applications-filters", false); await page.keyboard.press("Escape");
  const cb = page.locator('main table [role="checkbox"], main table input[type=checkbox]');
  if (await cb.count()) { await cb.first().click().catch(() => {}); await page.waitForTimeout(800); await shot(page, "04-applications-bulk", false); log({ label: "apps-bulk", b: await buttons(page) }); }
  flush(iss, "04 apps");
});

test("03c lifecycle quick", async ({ page }) => {
  test.setTimeout(420_000);
  const iss = watch(page);
  await seedLogin(page);
  const id = process.env.QA_JOB_ID!;
  const t0 = Date.now();
  const r = await page.goto(`/en/employer/jobs/${id}/edit`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => String(e).slice(0, 150));
  await page.waitForTimeout(5000);
  log({ label: "edit-goto", r: typeof r === "string" ? r : r?.status(), ms: Date.now() - t0, url: page.url() });
  await page.screenshot({ path: "qa-reports/screens/employer/03c-edit.png", timeout: 15000 }).catch((e) => log({ label: "edit-shot-err", e: String(e).slice(0, 100) }));
  flush(iss, "03c edit");
  await page.goto(`/en/employer/jobs/${id}`, { waitUntil: "load", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "03c-detail-active", false);
  await page.locator('button[aria-label="More actions"]').first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const items = await page.locator("[role=menuitem]").allInnerTexts().catch(() => []);
  log({ label: "more-menu", items, b: await buttons(page) });
  await shot(page, "03c-more-menu", false);
  for (const [n, re] of [["pause", /Pause/i], ["resume", /Resume|Reopen|Activate/i], ["close", /Close/i]] as const) {
    await page.keyboard.press("Escape");
    let el = page.locator("main button:visible").filter({ hasText: re }).first();
    if (!(await el.count())) { await page.locator('button[aria-label="More actions"]').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(600); el = page.locator("[role=menuitem]:visible").filter({ hasText: re }).first(); }
    const has = await el.count();
    if (has) await el.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const d = page.locator('[role="alertdialog"]:visible, [role="dialog"]:visible');
    let dtext = "";
    if (await d.count()) { dtext = (await d.first().innerText()).replace(/\s+/g, " ").slice(0, 300); await shot(page, `03c-${n}-dialog`, false); await d.first().locator("button").last().click({ timeout: 8000 }).catch(() => {}); }
    await page.waitForTimeout(3500);
    await shot(page, `03c-${n}`, false);
    log({ label: `lc-${n}`, has, dtext, head: (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200) });
    flush(iss, `03c ${n}`);
    if (n === "resume") {
      await page.goto(`/en/jobs/${id}`, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await shot(page, "03c-public-detail-by-id", false);
      log({ label: "public-by-id", url: page.url(), h1: await page.locator("h1").first().innerText().catch(() => null) });
      await page.goto(`/en/employer/jobs/${id}`, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
});
