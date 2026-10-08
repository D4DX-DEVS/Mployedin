import { test, expect } from "@playwright/test";
import fs from "fs";
import { attachProbes, visit, shot, login, note, SEEKER } from "./_qa-helpers";

// (not serial: independent flows)
test.setTimeout(6 * 60_000);
test.use({ actionTimeout: 15_000, navigationTimeout: 45_000 });
const only = process.env.QA_ONLY; // comma list of test keys
const want = (k: string) => !only || only.split(",").includes(k);
const isMobile = (n: string) => n.includes("mobile");

test("01 public pages (anon)", async ({ page }, ti) => {
  test.skip(!want("public") || isMobile(ti.project.name));
  const p = attachProbes(page, "public");
  await visit(page, p, "01-home", "/en");
  await visit(page, p, "01-jobs", "/en/jobs");
  // search
  const search = page.locator('input[type="search"], input[name="q"], input[placeholder*="earch" i]').first();
  if (await search.count()) {
    await search.fill("engineer");
    await search.press("Enter");
    await page.waitForTimeout(2500);
    await shot(page, "01-jobs-search-engineer");
    note({ step: "jobs-search", url: page.url(), resultsText: (await page.locator("main").innerText()).slice(0, 300) });
    await search.fill("zzqxnonexistent");
    await search.press("Enter");
    await page.waitForTimeout(2500);
    await shot(page, "01-jobs-search-empty");
    note({ step: "jobs-search-empty", url: page.url() });
  } else note({ step: "jobs-search", issue: "no search input found" });
  p.flush("jobs-search");
  // sort & pagination via query
  await visit(page, p, "01-jobs-page2", "/en/jobs?page=2");
  const controls = await page.evaluate(() => ({
    selects: Array.from(document.querySelectorAll("select,[role=combobox]")).map((e) => (e as HTMLElement).innerText || e.getAttribute("aria-label") || e.id).slice(0, 12),
    buttons: Array.from(document.querySelectorAll("main button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 40),
    jobLinks: Array.from(document.querySelectorAll('a[href*="/jobs/"]')).map((a) => a.getAttribute("href")).slice(0, 10),
    pager: Array.from(document.querySelectorAll('nav[aria-label*="agin" i] a, nav[aria-label*="agin" i] button, a[href*="page="]')).map((a) => (a as HTMLElement).innerText.trim()).slice(0, 15),
  }));
  note({ step: "jobs-controls", ...controls });
  await visit(page, p, "01-jobs-list", "/en/jobs");
  const jobHref = await page.locator('main a[href*="/jobs/"]').first().getAttribute("href").catch(() => null);
  note({ step: "job-href", jobHref });
  if (jobHref) await visit(page, p, "01-job-detail", jobHref);
  await visit(page, p, "01-jobs-bad-id", "/en/jobs/000000000000000000000000");
  await visit(page, p, "01-companies", "/en/companies");
  const compHref = await page.locator('main a[href*="/companies/"]').first().getAttribute("href").catch(() => null);
  if (compHref) await visit(page, p, "01-company-detail", compHref);
  await visit(page, p, "01-salary-explorer", "/en/salary-explorer");
  await visit(page, p, "01-blog", "/en/blog");
  const blogHref = await page.locator('main a[href*="/blog/"]').first().getAttribute("href").catch(() => null);
  if (blogHref) await visit(page, p, "01-blog-post", blogHref);
  await visit(page, p, "01-faq", "/en/faq");
  await visit(page, p, "01-about", "/en/about");
  await visit(page, p, "01-privacy", "/en/privacy");
  await visit(page, p, "01-terms", "/en/terms");
  await visit(page, p, "01-cookies", "/en/cookies");
  await visit(page, p, "01-gdpr", "/en/gdpr");
  await visit(page, p, "01-404", "/en/this-does-not-exist-qa");
  // contact
  await visit(page, p, "01-contact", "/en/contact");
  const form = page.locator("main form").first();
  if (await form.count()) {
    const fields = await form.locator("input,textarea,select").evaluateAll((els) => els.map((e) => ({ tag: e.tagName, name: (e as HTMLInputElement).name, id: e.id, type: (e as HTMLInputElement).type, req: (e as HTMLInputElement).required })));
    note({ step: "contact-fields", fields });
    await form.locator('button[type=submit]').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "01-contact-empty-submit", false);
    const ts = Date.now();
    for (const f of fields) {
      const loc = form.locator(f.id ? `#${f.id}` : `[name="${f.name}"]`).first();
      if (f.tag === "TEXTAREA") await loc.fill("qa- automated test message, please ignore. Testing the contact form end to end.");
      else if (f.type === "email" || /email/i.test(f.name + f.id)) await loc.fill(`qa-contact-${ts}@example.com`);
      else if (/phone/i.test(f.name + f.id)) await loc.fill("+971500000000");
      else if (f.type === "checkbox") await loc.check().catch(() => {});
      else if (f.tag === "INPUT" && ["text", ""].includes(f.type)) await loc.fill(/name/i.test(f.name + f.id) ? "qa-contact tester" : "qa- subject test");
    }
    // radix selects
    const combos = form.locator("[role=combobox]");
    for (let i = 0; i < (await combos.count()); i++) {
      await combos.nth(i).click().catch(() => {});
      await page.locator("[role=option]").first().click().catch(() => {});
    }
    await shot(page, "01-contact-filled", false);
    await form.locator('button[type=submit]').first().click();
    await page.waitForTimeout(3000);
    await shot(page, "01-contact-submitted", false);
    note({ step: "contact-submit", text: (await page.locator("main").innerText()).slice(0, 400) });
  }
  p.flush("contact");
});

const DASH = ["", "applications", "calendar", "companies", "cv", "documents", "interviews", "jobs", "messages", "offers", "preferences", "profile", "profile/personal-details", "saved-searches", "search", "settings", "settings/notifications", "skills", "subscription", "onboarding"];

test("03 seeded seeker dashboard", async ({ page }, ti) => {
  test.skip(!want("dash") || isMobile(ti.project.name));
  const p = attachProbes(page, "dash");
  expect(await login(page)).toBeTruthy();
  note({ step: "login-landing", url: page.url() });
  await page.waitForTimeout(1500);
  const nav = await page.evaluate(() => Array.from(document.querySelectorAll('nav a, aside a, header a')).map((a) => `${(a as HTMLElement).innerText.trim().replace(/\s+/g, " ")} -> ${a.getAttribute("href")}`));
  note({ step: "dash-nav-links", nav: [...new Set(nav)] });
  for (const d of DASH) await visit(page, p, `03-js-${d.replace(/\//g, "_") || "home"}`, `/en/job-seeker${d ? "/" + d : ""}`);
  const extra = [...new Set(nav)].map((s) => s.split(" -> ")[1]).filter((h) => h && h.startsWith("/en/job-seeker/")).map((h) => h!.replace("/en/job-seeker/", "").split("?")[0]).filter((h) => !DASH.includes(h));
  note({ step: "extra-nav", extra });
  for (const e of [...new Set(extra)]) await visit(page, p, `03-js-extra-${e.replace(/\//g, "_")}`, `/en/job-seeker/${e}`);
});

async function clickText(page: import("@playwright/test").Page, re: RegExp, scope = "body") {
  const b = page.locator(`${scope} button, ${scope} a, ${scope} [role=button], ${scope} [role=tab], ${scope} [role=menuitem]`).filter({ hasText: re }).filter({ visible: true }).first();
  if (await b.count()) { await b.click({ timeout: 8000 }).catch((e) => note({ clickErr: String(e).slice(0, 150), re: String(re) })); return true; }
  note({ missing: String(re), url: page.url() });
  return false;
}
const bodyText = async (page: import("@playwright/test").Page, n = 600) => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, n);

test("02 registration + onboarding", async ({ page }, ti) => {
  test.skip(!want("reg") || isMobile(ti.project.name));
  const p = attachProbes(page, "reg");
  const ts = Date.now();
  const email = `qa-seeker-${ts}@example.com`;
  fs.writeFileSync("qa-reports/tmp/qa-seeker-email.txt", email);
  await visit(page, p, "02-register", "/en/register");
  await page.getByText(/^Find a job$/).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "02-register-form", false);
  note({ step: "reg-form-url", url: page.url() });
  await page.click("button[type=submit]");
  await page.waitForTimeout(800);
  await shot(page, "02-register-empty-submit", false);
  note({ step: "reg-empty-errors", errors: await page.locator('[id$="-error"]').allInnerTexts() });
  await page.fill("#name", "qa Seeker");
  await page.fill("#email", "not-an-email");
  await page.fill("#password", "short");
  await page.fill("#confirmPassword", "different");
  await page.click("button[type=submit]");
  await page.waitForTimeout(800);
  await shot(page, "02-register-invalid", false);
  note({ step: "reg-invalid-errors", errors: await page.locator('[id$="-error"]').allInnerTexts() });
  // duplicate email
  await page.fill("#email", SEEKER.email);
  await page.fill("#password", "QaSeeker@12345");
  await page.fill("#confirmPassword", "QaSeeker@12345");
  await page.locator("#terms").check().catch(async () => page.locator("#terms").click());
  await page.click("button[type=submit]");
  await page.waitForTimeout(3000);
  await shot(page, "02-register-duplicate", false);
  note({ step: "reg-duplicate", url: page.url(), text: await bodyText(page, 400) });
  if (page.url().includes("/register")) {
    await page.fill("#email", email);
    await page.click("button[type=submit]");
    await page.waitForTimeout(4000);
  }
  await shot(page, "02-register-after-submit");
  note({ step: "reg-submitted", url: page.url(), text: await bodyText(page, 400) });
  p.flush("register");
  const { execSync } = await import("child_process");
  note({ step: "verify-email", out: execSync(`node scripts/qa/_db.mjs verify-email ${email}`).toString() });
  expect(await login(page, email, "QaSeeker@12345")).toBeTruthy();
  await page.waitForTimeout(2500);
  note({ step: "reg-login-landing", url: page.url() });
  if (!page.url().includes("onboarding")) await page.goto("/en/onboarding", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await shot(page, "02-onb-step0");
  const btnDisabled = async () => page.getByRole("button", { name: /Save and continue/i }).isDisabled().catch(() => null);
  note({ step: "onb-step0", url: page.url(), saveDisabledInitially: await btnDisabled(), text: await bodyText(page, 800) });
  // step0
  await page.locator("#ob-fullName").fill("qa Seeker Onb").catch(() => {});
  await page.locator("#ob-mobileNumber").fill("501234567").catch(() => {});
  await page.getByRole("button", { name: /I'm a fresher/i }).click().catch((e) => note({ err: String(e).slice(0, 100) }));
  await shot(page, "02-onb-step0-filled");
  note({ step: "onb-step0-filled", saveDisabled: await btnDisabled() });
  await page.getByRole("button", { name: /Save and continue/i }).click();
  await page.waitForTimeout(2500);
  await shot(page, "02-onb-step1");
  note({ step: "onb-step1", text: await bodyText(page, 800), saveDisabled: await btnDisabled() });
  if (!(await clickText(page, /^Skip$/))) await page.getByRole("button", { name: /Save and continue/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "02-onb-step2");
  note({ step: "onb-step2", text: await bodyText(page, 800), saveDisabled: await btnDisabled() });
  await clickText(page, /^12th/);
  await page.waitForTimeout(500);
  await shot(page, "02-onb-step2-filled");
  note({ step: "onb-step2-filled", saveDisabled: await btnDisabled(), text: await bodyText(page, 600) });
  await page.getByRole("button", { name: /Save and continue/i }).click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "02-onb-step3");
  note({ step: "onb-step3", text: await bodyText(page, 1000) });
  const submitBtn = page.getByRole("button", { name: /^(Submit|Finish|Complete)/i }).last();
  note({ step: "onb-step3-submitDisabled", disabled: await submitBtn.isDisabled().catch(() => null) });
  await page.locator("#ob-resumeHeadline").fill("qa- Fresher looking for junior software roles in Dubai").catch(() => {});
  await page.getByLabel(/Yes, employers can find me/i).check().catch((e) => note({ err: String(e).slice(0, 100) }));
  await shot(page, "02-onb-step3-filled");
  await submitBtn.click().catch((e) => note({ err: String(e).slice(0, 100) }));
  await page.waitForTimeout(5000);
  await shot(page, "02-onb-done");
  note({ step: "onb-done", url: page.url(), text: await bodyText(page, 600) });
  p.flush("onboarding");
  await visit(page, p, "02-newuser-profile", "/en/job-seeker/profile");
  // second user: complete later
  const email2 = `qa-seeker-later-${ts}@example.com`;
  await page.context().clearCookies();
  await page.goto("/en/register", { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.getByText(/^Find a job$/).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.fill("#name", "qa Later");
  await page.fill("#email", email2);
  await page.fill("#password", "QaSeeker@12345");
  await page.fill("#confirmPassword", "QaSeeker@12345");
  await page.locator("#terms").check().catch(async () => page.locator("#terms").click());
  await page.click("button[type=submit]");
  await page.waitForTimeout(4000);
  execSync(`node scripts/qa/_db.mjs verify-email ${email2}`);
  await login(page, email2, "QaSeeker@12345");
  await page.waitForTimeout(2500);
  if (!page.url().includes("onboarding")) await page.goto("/en/onboarding", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await clickText(page, /Complete later/i);
  await page.waitForTimeout(5000);
  await shot(page, "02-later-landing");
  note({ step: "later-landing", url: page.url(), text: await bodyText(page, 800) });
  await visit(page, p, "02-later-profile", "/en/job-seeker/profile");
  note({ step: "later-profile-text", text: await bodyText(page, 1500) });
  await visit(page, p, "02-later-onboarding-revisit", "/en/onboarding");
  fs.writeFileSync("qa-reports/tmp/qa-seeker-email2.txt", email2);
});

test("04 apply as seeded seeker + guest", async ({ page, browser }, ti) => {
  test.skip(!want("apply") || isMobile(ti.project.name));
  const p = attachProbes(page, "apply");
  expect(await login(page)).toBeTruthy();
  await visit(page, p, "04-js-jobs", "/en/job-seeker/jobs");
  // find a job via public jobs list
  await page.goto("/en/jobs?q=qa-", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  let hrefs = await page.locator('main a[href*="/jobs/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  if (!hrefs.length) { await page.goto("/en/jobs", { waitUntil: "load" }); await page.waitForTimeout(2500); hrefs = await page.locator('main a[href*="/jobs/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href"))); }
  hrefs = [...new Set(hrefs.filter(Boolean))];
  note({ step: "apply-candidates", hrefs: hrefs.slice(0, 8) });
  let applied = false;
  for (const h of hrefs.slice(0, 4)) {
    await visit(page, p, `04-job-detail-authed`, h!);
    const txt = await bodyText(page, 3000);
    if (/Applied|Already applied/i.test(txt)) { note({ step: "already-applied", h }); continue; }
    const btn = page.locator("button, a").filter({ hasText: /^(Easy Apply|Apply now|Apply|Quick apply|Apply with CV)$/i }).filter({ visible: true }).first();
    if (!(await btn.count())) { note({ step: "no-apply-btn", h }); continue; }
    await btn.click();
    await page.waitForTimeout(3000);
    await shot(page, "04-apply-step1");
    note({ step: "apply-step1", url: page.url(), text: await bodyText(page, 1200) });
    for (let s = 2; s <= 6; s++) {
      const dlg = page.locator("[role=dialog]").last();
      const scope = (await dlg.count()) ? "[role=dialog]" : "body";
      if (await page.locator(`${scope} button`).filter({ hasText: /^Submit application$/i }).count()) {
        await shot(page, "04-apply-review");
        await page.locator(`${scope} button`).filter({ hasText: /^Submit application$/i }).first().click();
        await page.waitForTimeout(4000);
        await shot(page, "04-apply-success");
        note({ step: "apply-submitted", text: await bodyText(page, 800) });
        applied = true;
        break;
      }
      const next = page.locator(`${scope} button`).filter({ hasText: /^(Next|Continue|Submit Application)$/i }).filter({ visible: true }).first();
      if (!(await next.count())) { note({ step: "apply-no-next", s }); break; }
      note({ step: `apply-next-disabled-${s}`, disabled: await next.isDisabled() });
      await next.click().catch(() => {});
      await page.waitForTimeout(2000);
      await shot(page, `04-apply-step${s}`);
      note({ step: `apply-step${s}`, text: await bodyText(page, 800) });
      if (/Application sent|applied/i.test(await bodyText(page, 3000))) { applied = true; break; }
    }
    p.flush("apply-flow");
    if (applied) break;
  }
  note({ step: "applied", applied });
  await visit(page, p, "04-applications", "/en/job-seeker/applications");
  const appHref = await page.locator('a[href*="/job-seeker/applications/"]').first().getAttribute("href").catch(() => null);
  if (appHref) {
    await visit(page, p, "04-application-detail", appHref);
    const w = page.locator("button").filter({ hasText: /Withdraw/i }).first();
    if (await w.count()) {
      await w.click();
      await page.waitForTimeout(1500);
      await shot(page, "04-withdraw-dialog", false);
      note({ step: "withdraw-dialog", text: await bodyText(page, 600) });
      const conf = page.locator("[role=dialog] button, [role=alertdialog] button").filter({ hasText: /Withdraw|Confirm|Yes/i }).last();
      if (await conf.count()) { await conf.click(); await page.waitForTimeout(3000); }
      await shot(page, "04-withdraw-after");
      note({ step: "withdraw-after", text: await bodyText(page, 600) });
    } else note({ step: "withdraw", issue: "no withdraw button" });
  }
  p.flush("applications");
  // guest apply
  const ctx = await browser.newContext();
  const g = await ctx.newPage();
  const gp = attachProbes(g, "guest");
  const h = hrefs[1] ?? hrefs[0];
  if (h) {
    await visit(g, gp, "04-guest-job-detail", h);
    const btn = g.locator("button, a").filter({ hasText: /Apply/i }).filter({ visible: true }).first();
    note({ step: "guest-apply-btn", text: await btn.innerText().catch(() => null) });
    await btn.click().catch(() => {});
    await g.waitForTimeout(3000);
    await shot(g, "04-guest-apply-1");
    note({ step: "guest-apply-1", url: g.url(), text: await bodyText(g, 1000) });
    const em = g.locator('input[type=email]').filter({ visible: true }).first();
    if (await em.count()) {
      const nm = g.locator('input[name*=name i], input[id*=name i]').filter({ visible: true }).first();
      if (await nm.count()) await nm.fill("qa Guest");
      await em.fill(`qa-guest-${Date.now()}@example.com`);
      await shot(g, "04-guest-apply-filled");
      const go = g.locator("button").filter({ hasText: /continue|send|apply|next|verify|code/i }).filter({ visible: true }).last();
      await go.click().catch(() => {});
      await g.waitForTimeout(4000);
      await shot(g, "04-guest-apply-otp");
      note({ step: "guest-otp", url: g.url(), text: await bodyText(g, 1000) });
    }
    gp.flush("guest");
  }
  await ctx.close();
});

test("05 profile cv docs skills", async ({ page }, ti) => {
  test.skip(!want("profile") || isMobile(ti.project.name));
  const p = attachProbes(page, "profile");
  expect(await login(page)).toBeTruthy();
  const pct: Record<string, string[]> = {};
  const grabPct = async (k: string) => { pct[k] = (await bodyText(page, 20000)).match(/\d{1,3}\s?%/g)?.slice(0, 6) ?? []; };
  await visit(page, p, "05-home", "/en/job-seeker"); await grabPct("home");
  await visit(page, p, "05-profile", "/en/job-seeker/profile"); await grabPct("profile");
  await visit(page, p, "05-cv", "/en/job-seeker/cv"); await grabPct("cv");
  await visit(page, p, "05-personal", "/en/job-seeker/profile/personal-details"); await grabPct("personal");
  note({ step: "completeness", pct });
  // edit personal details: try first text input
  const inputs = await page.locator("main input:not([type=hidden]):not([type=file]), main textarea").evaluateAll((els) => els.map((e) => ({ id: e.id, name: (e as HTMLInputElement).name, type: (e as HTMLInputElement).type, val: (e as HTMLInputElement).value.slice(0, 40), disabled: (e as HTMLInputElement).disabled })));
  note({ step: "personal-inputs", inputs });
  const saveBtn = page.locator("main button").filter({ hasText: /^Save/i }).first();
  const editable = page.locator("main textarea, main input[type=text]").filter({ visible: true });
  if (await editable.count()) {
    const target = editable.last();
    const old = await target.inputValue();
    note({ step: "personal-edit-target", old });
    if (await saveBtn.count()) {
      await saveBtn.click(); await page.waitForTimeout(2500);
      await shot(page, "05-personal-saved", false);
      note({ step: "personal-save", text: await bodyText(page, 400) });
    } else note({ step: "personal-edit", issue: "no save button visible" });
  }
  p.flush("personal");
  // CV upload on documents page
  await visit(page, p, "05-documents", "/en/job-seeker/documents");
  const file = page.locator("input[type=file]");
  note({ step: "docs-file-inputs", n: await file.count(), accept: await file.first().getAttribute("accept").catch(() => null) });
  if (await file.count()) {
    await file.first().setInputFiles("qa-reports/tmp/qa-cv.pdf");
    await page.waitForTimeout(5000);
    await shot(page, "05-documents-after-upload");
    note({ step: "docs-upload", text: await bodyText(page, 1200) });
  }
  p.flush("docs-upload");
  await visit(page, p, "05-cv-after", "/en/job-seeker/cv");
  const cvFile = page.locator("input[type=file]");
  note({ step: "cv-file-inputs", n: await cvFile.count() });
  await visit(page, p, "05-skills", "/en/job-seeker/skills");
  const skillIn = page.locator("main input[type=text], main input:not([type])").filter({ visible: true }).first();
  if (await skillIn.count()) {
    await skillIn.fill("qa-Testing");
    await skillIn.press("Enter");
    await page.waitForTimeout(2000);
    await shot(page, "05-skills-added");
    note({ step: "skills-add", text: await bodyText(page, 800) });
  }
  p.flush("skills");
});

test("06-08 saved search, messages, settings", async ({ page }, ti) => {
  test.skip(!want("misc") || isMobile(ti.project.name));
  const p = attachProbes(page, "misc");
  expect(await login(page)).toBeTruthy();
  await visit(page, p, "06-jobs-feed", "/en/job-seeker/jobs");
  const q = page.locator('main input[type=search], main input[placeholder*="earch" i], main input[placeholder*="title" i]').filter({ visible: true }).first();
  if (await q.count()) { await q.fill("developer"); await q.press("Enter"); await page.waitForTimeout(2500); }
  await shot(page, "06-jobs-feed-search");
  if (await clickText(page, /Save search/i)) {
    await page.waitForTimeout(1500);
    await shot(page, "06-save-search-dialog");
    const nameIn = page.locator("[role=dialog] input").first();
    if (await nameIn.count()) await nameIn.fill(`qa-search-${Date.now()}`);
    await page.locator("[role=dialog] button").filter({ hasText: /^Save search$/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "06-save-search-after", false);
    note({ step: "saved-search", text: await bodyText(page, 500) });
  }
  await visit(page, p, "06-saved-searches", "/en/job-seeker/saved-searches");
  const sw = page.locator("main [role=switch]").first();
  if (await sw.count()) {
    const before = await sw.getAttribute("aria-checked");
    await sw.click(); await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(2500);
    const after = await page.locator("main [role=switch]").first().getAttribute("aria-checked");
    note({ step: "saved-search-toggle", before, after, persisted: before !== after });
    await shot(page, "06-saved-searches-toggled");
  } else note({ step: "saved-search-toggle", issue: "no switch" });
  p.flush("saved");
  // messages
  await visit(page, p, "07-messages", "/en/job-seeker/messages");
  note({ step: "messages", text: await bodyText(page, 800), buttons: await page.locator("main button").allInnerTexts() });
  if (await clickText(page, /New (message|conversation)|Start/i, "main")) { await page.waitForTimeout(1500); await shot(page, "07-messages-new"); }
  p.flush("messages");
  // settings
  await visit(page, p, "08-settings", "/en/job-seeker/settings");
  note({ step: "settings", text: await bodyText(page, 2000) });
  const tabs = await page.locator("main [role=tab], main nav a").allInnerTexts();
  note({ step: "settings-tabs", tabs });
  // password change validation
  const pw = page.locator("input[type=password]");
  note({ step: "pw-fields", n: await pw.count() });
  if ((await pw.count()) >= 2) {
    await pw.nth(0).fill("wrongcurrent");
    await pw.nth(1).fill("abc");
    if ((await pw.count()) >= 3) await pw.nth(2).fill("abcd");
    await clickText(page, /(Change|Update) password/i, "main");
    await page.waitForTimeout(2000);
    await shot(page, "08-settings-password-invalid");
    note({ step: "pw-invalid", text: await bodyText(page, 600) });
  }
  // delete account UI
  if (await clickText(page, /Delete (my )?account/i, "main")) {
    await page.waitForTimeout(1500);
    await shot(page, "08-delete-account-dialog", false);
    note({ step: "delete-dialog", text: await bodyText(page, 600) });
    await page.keyboard.press("Escape");
  }
  p.flush("settings");
  await visit(page, p, "08-notifications", "/en/job-seeker/settings/notifications");
  const sws = page.locator("main [role=switch], main input[type=checkbox]");
  const n = await sws.count();
  note({ step: "notif-switches", n });
  if (n) {
    const el = sws.nth(Math.min(1, n - 1));
    const before = (await el.getAttribute("aria-checked")) ?? String(await el.isChecked());
    await el.click(); await page.waitForTimeout(1000);
    await clickText(page, /^Save/i, "main");
    await page.waitForTimeout(2500);
    await shot(page, "08-notifications-toggled", false);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3000);
    const el2 = page.locator("main [role=switch], main input[type=checkbox]").nth(Math.min(1, n - 1));
    const after = (await el2.getAttribute("aria-checked")) ?? String(await el2.isChecked());
    note({ step: "notif-persist", before, after, persisted: before !== after });
    // restore
    await el2.click(); await page.waitForTimeout(800); await clickText(page, /^Save/i, "main"); await page.waitForTimeout(2000);
  }
  p.flush("notifications");
  // language switch
  await page.goto("/en/job-seeker", { waitUntil: "load" }); await page.waitForTimeout(1500);
  const lang = page.locator('button[aria-label*="anguage" i], a[href^="/ar"], button:has-text("العربية"), button:has-text("EN")').first();
  note({ step: "lang-switch-found", n: await lang.count() });
  if (await lang.count()) {
    await lang.click(); await page.waitForTimeout(1500);
    const ar = page.locator('[role=menuitem]:has-text("العربية"), a:has-text("العربية"), button:has-text("العربية")').first();
    if (await ar.count()) await ar.click();
    await page.waitForTimeout(3000);
    await shot(page, "08-lang-switched");
    note({ step: "lang-switched", url: page.url(), dir: await page.evaluate(() => document.documentElement.dir) });
  }
  p.flush("lang");
});

test("09 mobile", async ({ page }, ti) => {
  test.skip(!want("mobile") || !isMobile(ti.project.name));
  const p = attachProbes(page, "mobile");
  await visit(page, p, "09-m-home", "/en");
  await visit(page, p, "09-m-jobs", "/en/jobs");
  const h = await page.locator('main a[href*="/jobs/"]').first().getAttribute("href").catch(() => null);
  if (h) await visit(page, p, "09-m-job-detail", h);
  await visit(page, p, "09-m-register", "/en/register");
  expect(await login(page)).toBeTruthy();
  await visit(page, p, "09-m-js-home", "/en/job-seeker", { full: false });
  await shot(page, "09-m-js-home-full");
  await visit(page, p, "09-m-js-profile", "/en/job-seeker/profile");
  await visit(page, p, "09-m-js-jobs", "/en/job-seeker/jobs");
  await visit(page, p, "09-m-js-applications", "/en/job-seeker/applications");
  if (h) {
    await visit(page, p, "09-m-job-detail-authed", h, { full: false });
    const btn = page.locator("button, a").filter({ hasText: /^(Easy Apply|Apply now|Apply|Quick apply)$/i }).filter({ visible: true }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(3000); await shot(page, "09-m-apply-open", false); note({ step: "m-apply", text: await bodyText(page, 600) }); }
  }
  // tap targets on js home
  await page.goto("/en/job-seeker", { waitUntil: "load" }); await page.waitForTimeout(2000);
  const small = await page.evaluate(() => Array.from(document.querySelectorAll("a,button")).filter((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && r.top < window.innerHeight; }).map((e) => `${(e as HTMLElement).innerText.trim().slice(0, 20) || e.getAttribute("aria-label")} ${Math.round((e as HTMLElement).getBoundingClientRect().width)}x${Math.round((e as HTMLElement).getBoundingClientRect().height)}`).slice(0, 20));
  note({ step: "m-small-targets", small });
  await page.locator('button[aria-label*="menu" i]').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await shot(page, "09-m-menu-open", false);
  p.flush("mobile");
});

test("10 arabic", async ({ page }, ti) => {
  test.skip(!want("ar") || isMobile(ti.project.name));
  const p = attachProbes(page, "ar");
  await visit(page, p, "10-ar-home", "/ar");
  await visit(page, p, "10-ar-jobs", "/ar/jobs");
  const h = await page.locator('main a[href*="/jobs/"]').first().getAttribute("href").catch(() => null);
  if (h) await visit(page, p, "10-ar-job-detail", h);
  expect(await login(page, SEEKER.email, SEEKER.password, "ar")).toBeTruthy();
  await visit(page, p, "10-ar-js-home", "/ar/job-seeker");
  await visit(page, p, "10-ar-js-profile", "/ar/job-seeker/profile");
  await visit(page, p, "10-ar-js-applications", "/ar/job-seeker/applications");
  await visit(page, p, "10-ar-js-settings", "/ar/job-seeker/settings");
  for (const n of ["10-ar-js-home", "10-ar-js-profile", "10-ar-js-settings"]) void n;
  const latin = await page.evaluate(() => { const t = document.querySelector("main")?.innerText ?? ""; return (t.match(/\b[A-Za-z][a-z]{3,}(?: [A-Za-z][a-z]{2,}){1,}/g) || []).slice(0, 30); });
  note({ step: "ar-latin-in-settings", latin });
  await page.goto("/ar/job-seeker", { waitUntil: "load" }); await page.waitForTimeout(2000);
  note({ step: "ar-latin-home", latin: await page.evaluate(() => { const t = document.body.innerText; return (t.match(/\b[A-Za-z][a-z]{3,}(?: [A-Za-z][a-z]{2,}){1,}/g) || []).slice(0, 30); }) });
  p.flush("ar");
});

test("11 anon extras (rerun on warm server)", async ({ page }, ti) => {
  test.skip(!want("anon") || isMobile(ti.project.name));
  const p = attachProbes(page, "anon");
  await page.goto("/en/jobs", { waitUntil: "load" }); await page.waitForTimeout(1500);
  const hrefs = [...new Set(await page.locator('main a[href*="/jobs/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href"))))];
  await visit(page, p, "11-job-detail", hrefs[0]!);
  await page.waitForTimeout(4000); await shot(page, "11-job-detail-late");
  note({ step: "job-detail-text", text: await bodyText(page, 1500), btns: await page.locator("main button, main a").allInnerTexts().then((a) => a.filter((x) => /apply|save|share/i.test(x))) });
  await visit(page, p, "11-jobs-search", "/en/jobs?q=engineer");
  await visit(page, p, "11-jobs-search-empty", "/en/jobs?q=zzqxnonexistent");
  await visit(page, p, "11-privacy", "/en/privacy"); await page.waitForTimeout(3000); await shot(page, "11-privacy-late");
  note({ step: "privacy-text", text: await bodyText(page, 400), h1: await page.locator("h1").allInnerTexts() });
  await visit(page, p, "11-terms", "/en/terms");
  note({ step: "terms-text", text: await bodyText(page, 400), h1: await page.locator("h1").allInnerTexts() });
  await visit(page, p, "11-blog-post", "/en/blog/audit-dynamic-routes"); await page.waitForTimeout(3000); await shot(page, "11-blog-post-late");
  note({ step: "blogpost", title: await page.title(), h1: await page.locator("h1").allInnerTexts() });
  // guest apply
  await page.goto(hrefs[1]!, { waitUntil: "load" }); await page.waitForTimeout(3000);
  const btn = page.locator("button, a").filter({ hasText: /apply/i }).filter({ visible: true }).first();
  note({ step: "guest-apply-btn", text: await btn.innerText().catch(() => null), n: await btn.count() });
  await btn.click().catch(() => {}); await page.waitForTimeout(3000);
  await shot(page, "11-guest-apply-1", false);
  note({ step: "guest-apply-1", url: page.url(), text: await bodyText(page, 1200), inputs: await page.locator("input:visible").evaluateAll((e) => e.map((x) => `${x.id}|${(x as HTMLInputElement).name}|${(x as HTMLInputElement).type}|${(x as HTMLInputElement).placeholder}`)) });
  p.flush("guest");
  // registration submit
  const email = `qa-seeker-${Date.now()}@example.com`;
  await visit(page, p, "11-register", "/en/register");
  await page.click("button[type=submit]"); await page.waitForTimeout(800);
  await shot(page, "11-register-empty", false);
  note({ step: "reg-empty-errors", errors: await page.locator('[id$="-error"]').allInnerTexts() });
  await page.fill("#name", "qa Seeker"); await page.fill("#email", "bad"); await page.fill("#password", "short"); await page.fill("#confirmPassword", "diff");
  await page.click("button[type=submit]"); await page.waitForTimeout(800);
  await shot(page, "11-register-invalid", false);
  note({ step: "reg-invalid-errors", errors: await page.locator('[id$="-error"]').allInnerTexts() });
  await page.fill("#email", SEEKER.email); await page.fill("#password", "QaSeeker@12345"); await page.fill("#confirmPassword", "QaSeeker@12345");
  await page.locator("#terms").check().catch(async () => page.locator("#terms").click());
  await page.click("button[type=submit]"); await page.waitForTimeout(3500);
  await shot(page, "11-register-duplicate", false);
  note({ step: "reg-dup", url: page.url(), text: await bodyText(page, 1200) });
  if (page.url().includes("/register")) { await page.fill("#email", email); await page.click("button[type=submit]"); await page.waitForTimeout(5000); }
  await shot(page, "11-register-submitted", false);
  note({ step: "reg-submitted", email, url: page.url(), text: await bodyText(page, 800) });
  fs.writeFileSync("qa-reports/tmp/qa-seeker-email.txt", email);
  p.flush("register");
  // arabic public
  await visit(page, p, "11-ar-home", "/ar");
  await visit(page, p, "11-ar-jobs", "/ar/jobs");
  await visit(page, p, "11-ar-job-detail", hrefs[0]!.replace("/en/", "/ar/"));
  await visit(page, p, "11-ar-login", "/ar/login");
  await visit(page, p, "11-ar-register", "/ar/register");
  note({ step: "ar-latin", latin: await page.evaluate(() => (document.body.innerText.match(/\b[A-Za-z][a-z]{3,}(?: [A-Za-z][a-z]{2,}){1,}/g) || []).slice(0, 30)) });
});
