import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { inventory, violations } from "./support/inventory";
import {
  ANY_YOUTUBE_FRAMES,
  AR,
  DESKTOP,
  EN,
  IPHONE,
  LANDING_WITH_VIDEOS,
  NOCOOKIE_FRAMES,
  PROFILES,
  banner,
  bannerButton,
  consentCookie,
  cookieNamed,
  findPublicJobId,
  footerSettings,
  newVisitor,
  scrollThrough,
  setSwitch,
  settingsDialog,
  settle,
} from "./support/consentPage";
import type { Profile, Visitor } from "./support/consentPage";

/**
 * PECR / UK GDPR: before a choice, and after "Reject all", the browser holds only
 * strictly-necessary storage and contacts no third party. Accept, Customise and
 * Withdraw do what the Cookie settings say.
 *
 * Run it against a PRODUCTION build, served from its own folder so no other
 * build or the dev server's `.next` is touched. Build with the script, not a bare
 * `next build`: with another distDir, Next rewrites the tracked tsconfig.json and
 * next-env.d.ts to point at `.next-e2e/types`, and the script puts both back
 * byte for byte (and fails if it cannot):
 *
 *   node scripts/e2e-prod-build.mjs
 *   NEXT_DIST_DIR=.next-e2e npx next start -p 3890
 *   E2E_BASE_URL=http://localhost:3890 npx playwright test e2e/cookie-consent.spec.ts --project desktop-chromium
 *
 * With E2E_BASE_URL on another port, playwright.config.ts reuses that server and
 * never starts the dev server. The spec opens its own contexts (1440 desktop and
 * a 375 iPhone profile), so it runs once, under `desktop-chromium`.
 *
 * Nothing is written to a database: receipts, the language PATCH and the contact
 * form are answered inside the browser (support/consentPage.ts).
 */

const VISITOR_PAGES: Array<{ name: string; path: (jobId: string) => string; scroll?: boolean }> = [
  { name: "/en", path: () => "/en", scroll: true },
  { name: "/en/jobs", path: () => "/en/jobs" },
  { name: "job detail", path: (jobId) => `/en/jobs/${jobId}` },
  { name: "/en/companies", path: () => "/en/companies" },
  { name: "/en/login", path: () => "/en/login" },
  { name: "/en/register", path: () => "/en/register" },
  { name: "/ar", path: () => "/ar", scroll: true },
  { name: "/en/cookies", path: () => "/en/cookies" },
  { name: "/en/contact", path: () => "/en/contact" },
];

let jobId = "";
let baseURL = "";

test.describe.configure({ timeout: 120_000 });

// eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "opens its own desktop and iPhone contexts; runs once");
});

// eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring pattern
test.beforeAll(async ({}, testInfo) => {
  baseURL = (testInfo.project.use.baseURL as string | undefined) ?? "http://localhost:3888";
  jobId = await findPublicJobId(baseURL);
});

async function open(visitor: Visitor, path: string, scroll = false): Promise<void> {
  await visitor.page.goto(path, { waitUntil: "load" });
  await settle(visitor.page, 1_000);
  if (scroll) {
    await scrollThrough(visitor.page);
    await settle(visitor.page, 500);
  }
}

async function expectClean(visitor: Visitor, label: string, afterReject: boolean): Promise<void> {
  await visitor.hosts.collect(visitor.page);
  expect(violations(await inventory(visitor.page), { afterReject }), `${label}: storage outside the necessary rows`).toEqual([]);
  expect(visitor.hosts.offenders(), `${label}: third-party hosts`).toEqual([]);
}

test.describe("before a choice and after Reject all: only strictly necessary", () => {
  for (const profile of PROFILES) {
    for (const target of VISITOR_PAGES) {
      test(`${profile.label} ${target.name}`, async ({ browser }) => {
        test.skip(target.name === "job detail" && !jobId, "no public job found to open");
        const visitor = await newVisitor(browser, profile, baseURL);
        const path = target.path(jobId);
        const locale = path.startsWith("/ar") ? "ar" : "en";
        const copy = locale === "ar" ? AR : EN;
        await open(visitor, path, target.scroll);

        await expect(banner(visitor.page), "the banner asks before anything optional runs").toBeVisible();
        await expectClean(visitor, "before any click", false);
        expect(await consentCookie(visitor.context), "no choice is stored before a click").toBeUndefined();

        await bannerButton(visitor.page, copy.rejectAll).click();
        await expect(banner(visitor.page)).toHaveCount(0);
        const choice = await consentCookie(visitor.context);
        expect(choice).toMatchObject({ preferences: false, media: false });
        // The receipt is sent with the stored choice (the stub answers; nothing is written).
        await expect.poll(() => visitor.receipts.length, { timeout: 10_000 }).toBe(1);
        expect(visitor.receipts[0]).toEqual({ receiptId: choice?.id, preferences: false, media: false, version: choice?.v, locale, source: "banner" });

        await settle(visitor.page, 500);
        await expectClean(visitor, "after Reject all", true);
        // A fresh load after the choice: still nothing beyond the necessary rows.
        visitor.hosts.clear();
        await open(visitor, path, target.scroll);
        await expect(banner(visitor.page), "the choice is remembered").toHaveCount(0);
        await expectClean(visitor, "next page load after Reject all", true);
        await visitor.close();
      });
    }
  }
});

test.describe("the receipt", () => {
  test("a 5xx leaves the receipt pending for the tab, and it is sent again later", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL);
    visitor.receiptStatus.value = 503;
    await open(visitor, "/en/companies");
    await bannerButton(visitor.page, EN.rejectAll).click();
    const choice = await consentCookie(visitor.context);
    // First attempt plus the one retry after a short wait, both refused.
    await expect.poll(() => visitor.receipts.length, { timeout: 15_000 }).toBe(2);
    const pending = await visitor.page.waitForFunction(() => sessionStorage.getItem("mpl_receipt_pending"), undefined, { timeout: 10_000 });
    expect(JSON.parse(String(await pending.jsonValue()))).toMatchObject({ id: choice?.id, locale: "en", source: "banner" });

    visitor.receiptStatus.value = 204;
    // Durable retry: a resend is due after a back-off, or at once when the browser comes back online.
    await visitor.context.setOffline(true);
    await visitor.context.setOffline(false);
    const resent = await expect
      .poll(() => visitor.receipts.length, { timeout: 5_000 })
      .toBe(3)
      .then(() => true, () => false);
    if (!resent) {
      const marker = JSON.parse((await visitor.page.evaluate(() => sessionStorage.getItem("mpl_receipt_pending"))) ?? "{}") as { nextAt?: number };
      const wait = Math.max(0, (marker.nextAt ?? 0) - Date.now()) + 500;
      expect(wait, "the back-off fits the test").toBeLessThan(60_000);
      await visitor.page.waitForTimeout(wait);
      await open(visitor, "/en/jobs");
      await expect.poll(() => visitor.receipts.length, { timeout: 15_000 }).toBe(3);
    }
    expect(visitor.receipts[2]).toEqual(visitor.receipts[0]);
    await expect.poll(() => visitor.page.evaluate(() => sessionStorage.getItem("mpl_receipt_pending"))).toBeNull();
    await visitor.close();
  });
});

/** The public header's language link (desktop). */
async function switchLanguage(page: Page, to: "Arabic" | "English"): Promise<void> {
  await page.locator("header").getByRole("link", { name: to === "Arabic" ? "العربية" : "English" }).first().click();
  await page.waitForURL(to === "Arabic" ? /\/ar(\/|$)/ : /\/en(\/|$)/, { timeout: 15_000 });
  await settle(page, 500);
}

test.describe("Accept all, Customise and Withdraw", () => {
  test("Accept all: switching language keeps NEXT_LOCALE, and a CMS video plays inline", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL, { landing: LANDING_WITH_VIDEOS, videoStandIn: true });
    await open(visitor, "/en");
    await expect(visitor.page.locator(ANY_YOUTUBE_FRAMES), "no player before the choice").toHaveCount(0);
    await bannerButton(visitor.page, EN.acceptAll).click();
    await expect(visitor.page.locator(NOCOOKIE_FRAMES), "the placeholders become players").toHaveCount(2);
    expect(await consentCookie(visitor.context)).toMatchObject({ preferences: true, media: true });

    await switchLanguage(visitor.page, "Arabic");
    await expect(visitor.page.locator(NOCOOKIE_FRAMES), "videos play inline on the Arabic page too").toHaveCount(2);
    // The public header's language link remembers the choice while preferences are allowed.
    const locale = await cookieNamed(visitor.context, "NEXT_LOCALE");
    expect(locale?.value).toBe("ar");
    expect(locale?.expires, "a persistent cookie (12 months)").toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
    await visitor.close();
  });

  test("Reject all: switching language on a public page creates no NEXT_LOCALE", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL);
    await open(visitor, "/en/companies");
    await bannerButton(visitor.page, EN.rejectAll).click();
    await switchLanguage(visitor.page, "Arabic");
    await switchLanguage(visitor.page, "English");
    expect(await cookieNamed(visitor.context, "NEXT_LOCALE")).toBeUndefined();
    await visitor.close();
  });

  test("Customise with Preferences off and Videos on: the NEXT_LOCALE kept before the choice goes, and switching writes none", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL, { landing: LANDING_WITH_VIDEOS, videoStandIn: true });
    // D1: display settings are remembered unless the visitor objects, so a language picked before any choice is kept.
    await open(visitor, "/ar");
    await switchLanguage(visitor.page, "English");
    expect((await cookieNamed(visitor.context, "NEXT_LOCALE"))?.value, "no choice yet: the language is remembered (D1)").toBe("en");
    await bannerButton(visitor.page, EN.customise).click();
    const dialog = settingsDialog(visitor.page);
    await setSwitch(dialog.getByRole("switch", { name: EN.preferences }), false);
    await setSwitch(dialog.getByRole("switch", { name: EN.media }), true);
    await dialog.getByRole("button", { name: EN.save }).click();
    await expect(dialog).toBeHidden();
    expect(await consentCookie(visitor.context)).toMatchObject({ preferences: false, media: true });
    await expect(visitor.page.locator(NOCOOKIE_FRAMES)).toHaveCount(2);
    await expect.poll(() => visitor.receipts.length).toBe(1);
    expect(visitor.receipts[0]).toMatchObject({ preferences: false, media: true, source: "settings" });
    await expect.poll(async () => (await cookieNamed(visitor.context, "NEXT_LOCALE")) ?? null, { message: "the objection removes the kept NEXT_LOCALE" }).toBeNull();

    await switchLanguage(visitor.page, "Arabic");
    expect(await cookieNamed(visitor.context, "NEXT_LOCALE"), "no NEXT_LOCALE after switching with Preferences off").toBeUndefined();
    await visitor.close();
  });

  test("Withdraw from the footer Cookie settings: NEXT_LOCALE and ui:* keys go, the player goes", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL, { landing: LANDING_WITH_VIDEOS, videoStandIn: true });
    await open(visitor, "/en");
    await bannerButton(visitor.page, EN.acceptAll).click();
    await switchLanguage(visitor.page, "Arabic");
    expect((await cookieNamed(visitor.context, "NEXT_LOCALE"))?.value).toBe("ar");
    await expect(visitor.page.locator(NOCOOKIE_FRAMES)).toHaveCount(2);
    // A layout choice kept while preferences were allowed (what a dismissed tip writes).
    await visitor.page.evaluate(() => localStorage.setItem("ui:e2e-dismissed-tip", "1"));

    await footerSettings(visitor.page, AR).click();
    const dialog = settingsDialog(visitor.page, AR);
    await dialog.locator("[data-cookie-dialog-footer]").getByRole("button", { name: AR.rejectAll }).click();
    await expect(dialog).toBeHidden();

    expect(await consentCookie(visitor.context)).toMatchObject({ preferences: false, media: false });
    await expect.poll(async () => (await cookieNamed(visitor.context, "NEXT_LOCALE")) ?? null).toBeNull();
    expect(await visitor.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ui:")))).toEqual([]);
    await expect(visitor.page.locator(ANY_YOUTUBE_FRAMES)).toHaveCount(0);
    await visitor.close();
  });

  test("closing Cookie settings without saving on a first visit stores nothing and keeps the banner", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL);
    await open(visitor, "/en/companies");
    await bannerButton(visitor.page, EN.customise).click();
    const dialog = settingsDialog(visitor.page);
    await expect(dialog).toBeVisible();
    await visitor.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await consentCookie(visitor.context)).toBeUndefined();
    await expect(banner(visitor.page)).toBeVisible();
    expect(visitor.receipts).toEqual([]);
    await visitor.close();
  });
});

test.describe("Arabic banner and dialog", () => {
  for (const profile of PROFILES) {
    test(`${profile.label}: /ar shows the banner and the dialog in Arabic, right to left`, async ({ browser }) => {
      const visitor = await newVisitor(browser, profile, baseURL);
      await open(visitor, "/ar");
      await expect(visitor.page.locator("html")).toHaveAttribute("dir", "rtl");
      for (const name of [AR.rejectAll, AR.acceptAll, AR.customise]) await expect(bannerButton(visitor.page, name)).toBeVisible();
      await expectSameSize(bannerButton(visitor.page, AR.rejectAll), bannerButton(visitor.page, AR.acceptAll), "Arabic banner");
      await bannerButton(visitor.page, AR.customise).click();
      const dialog = settingsDialog(visitor.page, AR);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("switch", { name: AR.preferences })).toBeVisible();
      await expect(dialog.getByRole("switch", { name: AR.media })).toBeVisible();
      const footer = dialog.locator("[data-cookie-dialog-footer]");
      for (const name of [AR.rejectAll, AR.acceptAll, AR.save]) await expect(footer.getByRole("button", { name })).toBeVisible();
      await expectSameSize(footer.getByRole("button", { name: AR.rejectAll }), footer.getByRole("button", { name: AR.acceptAll }), "Arabic dialog footer");
      const overflow = await visitor.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "no sideways scroll").toBeLessThanOrEqual(0);
      await visitor.close();
    });
  }
});

/** Reject all and Accept all must look equally prominent: same width and height (1px tolerance). */
async function expectSameSize(a: Locator, b: Locator, label: string): Promise<void> {
  const [boxA, boxB] = [await a.boundingBox(), await b.boundingBox()];
  expect(boxA && boxB, `${label}: both buttons rendered`).toBeTruthy();
  expect(Math.abs(boxA!.width - boxB!.width), `${label}: same width (${boxA!.width} vs ${boxB!.width})`).toBeLessThanOrEqual(1);
  expect(Math.abs(boxA!.height - boxB!.height), `${label}: same height`).toBeLessThanOrEqual(1);
}

/** True when `box` lies fully inside the viewport (1px tolerance). */
function insideViewport(box: { x: number; y: number; width: number; height: number } | null, viewport: { width: number; height: number }): boolean {
  return Boolean(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
}

test.describe("layout", () => {
  for (const profile of PROFILES) {
    test(`${profile.label}: the banner is in the first screenshot, Reject and Accept are the same size`, async ({ browser }, testInfo) => {
      const visitor = await newVisitor(browser, profile, baseURL);
      await visitor.page.addInitScript(() => {
        const shifts: number[] = [];
        (window as unknown as { __shifts: number[] }).__shifts = shifts;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
            if (!entry.hadRecentInput) shifts.push(entry.value);
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await visitor.page.goto("/en", { waitUntil: "load" });
      await expect(banner(visitor.page)).toBeVisible();
      const shot = await visitor.page.screenshot();
      await testInfo.attach(`first-screenshot-${profile.label}`, { body: shot, contentType: "image/png" });
      const viewport = visitor.page.viewportSize()!;
      expect(insideViewport(await banner(visitor.page).locator("> *").first().boundingBox(), viewport), "banner inside the first screen").toBe(true);

      await expectSameSize(bannerButton(visitor.page, EN.rejectAll), bannerButton(visitor.page, EN.acceptAll), "banner");

      if (profile === IPHONE) {
        // Public pages have no bottom nav; the signed-in spec checks the banner over a dashboard's.
        await settle(visitor.page, 1_000);
        const bannerBox = (await banner(visitor.page).boundingBox())!;
        const launcher = visitor.page.getByRole("button", { name: "Accessibility options" });
        await expect(launcher, "the accessibility launcher is on the page").toBeVisible();
        const launcherBox = (await launcher.boundingBox())!;
        expect(launcherBox.y + launcherBox.height, "the accessibility button sits above the banner").toBeLessThanOrEqual(bannerBox.y + 1);
        const cls = await visitor.page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts.reduce((a, b) => a + b, 0));
        expect(cls, "cumulative layout shift while the banner appears").toBeLessThan(0.1);
        const overflow = await visitor.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      }
      await visitor.close();
    });
  }

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 375, height: 812 },
  ]) {
    test(`${viewport.width}x${viewport.height}: the Cookie settings buttons are fully on screen without scrolling`, async ({ browser }) => {
      const profile: Profile = viewport.width === 375 ? IPHONE : { label: "desktop", options: { ...DESKTOP.options, viewport } };
      const visitor = await newVisitor(browser, profile, baseURL);
      await open(visitor, "/en/companies");
      await bannerButton(visitor.page, EN.customise).click();
      const footer = settingsDialog(visitor.page).locator("[data-cookie-dialog-footer]");
      await expect(footer).toBeVisible();
      await visitor.page.waitForTimeout(400); // open animation
      for (const name of [EN.rejectAll, EN.acceptAll, EN.save]) {
        expect(insideViewport(await footer.getByRole("button", { name }).boundingBox(), viewport), `${name} inside ${viewport.width}x${viewport.height}`).toBe(true);
      }
      await expectSameSize(footer.getByRole("button", { name: EN.rejectAll }), footer.getByRole("button", { name: EN.acceptAll }), "dialog footer");
      await visitor.close();
    });
  }

  test("keyboard only: Reject all is reachable with Tab and works with Enter", async ({ browser }) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL);
    await open(visitor, "/en/companies");
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
      await visitor.page.keyboard.press("Tab");
      reached = await visitor.page.evaluate((name) => document.activeElement?.textContent?.trim() === name && Boolean(document.activeElement?.closest("[data-cookie-consent]")), EN.rejectAll);
    }
    expect(reached, "Reject all takes keyboard focus").toBe(true);
    await visitor.page.keyboard.press("Enter");
    await expect(banner(visitor.page)).toHaveCount(0);
    expect(await consentCookie(visitor.context)).toMatchObject({ preferences: false, media: false });
    await visitor.close();
  });
});

const RECAPTCHA = /^https:\/\/(www\.)?(google\.com|gstatic\.com)\/recaptcha\//;

test.describe("reCAPTCHA loads only on the tap that needs it", () => {
  test("/en/contact: nothing before Send; the form is stubbed, so nothing real is sent", async ({ browser }, testInfo) => {
    const visitor = await newVisitor(browser, DESKTOP, baseURL);
    let contactPosts = 0;
    await visitor.context.route("**/api/contact", (route) => {
      contactPosts += 1;
      return route.fulfill({ status: 200, json: { success: true } });
    });
    await open(visitor, "/en/contact");
    await visitor.page.locator("#contact-name").fill("E2E Visitor");
    await visitor.page.locator("#contact-email").fill("e2e-visitor@example.com");
    await visitor.page.locator("#contact-message").fill("Cookie consent end-to-end check; this form submission is stubbed.");
    await settle(visitor.page, 500);
    expect(visitor.hosts.urls.filter((u) => RECAPTCHA.test(u)), "reCAPTCHA before the tap").toEqual([]);

    await visitor.page.locator("form").getByRole("button", { name: /send/i }).click();
    // Control: the tap is what loads reCAPTCHA (aborted here, so the form then reports it blocked),
    // or, in a build with no site key, the stubbed form is posted with no captcha at all.
    await expect
      .poll(() => visitor.hosts.urls.some((u) => RECAPTCHA.test(u)) || contactPosts === 1, { timeout: 15_000 })
      .toBe(true);
    const after = visitor.hosts.urls.filter((u) => RECAPTCHA.test(u));
    testInfo.annotations.push({ type: "recaptcha", description: after.length ? `loaded on the tap: ${after[0]}` : "no site key in this build: no reCAPTCHA request at all" });
    expect(visitor.hosts.urls.filter((u) => !RECAPTCHA.test(u) && /google|gstatic/.test(u)), "no other Google host").toEqual([]);
    await visitor.close();
  });

  test("public job page (EasyApply): nothing before Send code", async ({ browser }, testInfo) => {
    test.skip(!jobId, "no public job found to open");
    const visitor = await newVisitor(browser, DESKTOP, baseURL);
    await visitor.context.route("**/api/auth/apply-otp/start", (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await open(visitor, `/en/jobs/${jobId}`);
    const name = visitor.page.locator("#anon-name").first();
    if (!(await name.isVisible())) await visitor.page.getByRole("button", { name: "Continue with email" }).first().click().catch(() => {});
    if (!(await name.isVisible().catch(() => false))) {
      expect(visitor.hosts.urls.filter((u) => RECAPTCHA.test(u))).toEqual([]);
      testInfo.annotations.push({ type: "recaptcha", description: "the quick-apply email form was not shown on this job; checked page load only" });
      await visitor.close();
      return;
    }
    await name.fill("E2E Visitor");
    await visitor.page.locator("#anon-email").first().fill("e2e-visitor@example.com");
    await settle(visitor.page, 500);
    expect(visitor.hosts.urls.filter((u) => RECAPTCHA.test(u)), "reCAPTCHA before the tap").toEqual([]);
    await visitor.page.getByRole("button", { name: "Send code" }).first().click();
    await settle(visitor.page, 1_000);
    const after = visitor.hosts.urls.filter((u) => RECAPTCHA.test(u));
    testInfo.annotations.push({ type: "recaptcha", description: after.length ? `loaded on the tap: ${after[0]}` : "no site key in this build: no reCAPTCHA request at all" });
    await visitor.close();
  });
});

test("the footer Cookie Policy link reaches the Cookie Policy page", async ({ browser }) => {
  const visitor = await newVisitor(browser, DESKTOP, baseURL);
  await open(visitor, "/en/companies");
  await bannerButton(visitor.page, EN.rejectAll).click();
  const link = visitor.page.locator("footer").getByRole("link", { name: "Cookies", exact: true }).first();
  await link.click();
  await visitor.page.waitForURL(/\/en\/cookies/, { timeout: 15_000 });
  await expect(visitor.page.locator("h1").first()).toBeVisible();
  // Content is the CMS copy until the owner runs update-legal-content --apply; only the page is checked here.
  await visitor.close();
});
