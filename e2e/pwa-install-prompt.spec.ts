import { expect, test, type Page } from "@playwright/test";

/**
 * The install card kept coming back after the user closed it. Three separate
 * causes, all regression-guarded here:
 *   1. the dismissal was only checked on mount, but Chrome re-fires
 *      `beforeinstallprompt` on client-side navigation;
 *   2. cancelling the native install dialog stored nothing at all;
 *   3. accepting the install *deleted* the stored dismissal, so the card
 *      returned on the next load whenever the install had not stuck.
 */

const STORAGE_KEY = "pwa-install-dismissed";
const SHOW_DELAY_MS = 3000;
const IOS_SHOW_DELAY_MS = 5000;

const card = (page: Page) => page.locator('div.fixed:has(img[alt="MPLOYEDIN"])');
const dismissButton = (page: Page) => card(page).locator("button").first();

/** The listener is attached in an effect, so the event is lost if it is
 *  dispatched before hydration — in dev that can take several seconds. */
async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.body.dataset.pwaPromptReady === "1", null, {
    timeout: 30_000,
  });
}

/** Chrome only fires this on a real installable site over https. */
async function fireInstallPrompt(page: Page, outcome: "accepted" | "dismissed" = "dismissed") {
  await hydrated(page);
  await page.evaluate((choice) => {
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: choice });
    window.dispatchEvent(event);
  }, outcome);
  await page.waitForTimeout(SHOW_DELAY_MS + 1000);
}

function readMarker(page: Page) {
  return page.evaluate((key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return "BLOCKED";
    }
  }, STORAGE_KEY);
}

test.describe("PWA install prompt", () => {
  /* Each case waits out the card's own 3–5s reveal delay several times over,
     and the dev server compiles routes on demand under a parallel run. The
     default 30s budget expires on hydration, not on a real assertion. */
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.goto("/en");
  });

  test("shows once, then stays gone for the session and across reloads", async ({ page }) => {
    // Two fires must not stack two timers onto the same card.
    await fireInstallPrompt(page);
    await fireInstallPrompt(page);
    await expect(card(page)).toHaveCount(1);
    await expect(card(page)).toBeVisible();

    await dismissButton(page).click();
    await expect(card(page)).toBeHidden();
    expect(Number(await readMarker(page))).toBeGreaterThan(0);

    // Cause 1: a later fire in the same session must not revive it.
    await fireInstallPrompt(page);
    await expect(card(page)).toBeHidden();

    await page.reload();
    await fireInstallPrompt(page);
    await expect(card(page)).toBeHidden();
  });

  test("cancelling the native dialog counts as a dismissal", async ({ page }) => {
    await fireInstallPrompt(page, "dismissed");
    await card(page).getByRole("button", { name: /install/i }).click();

    // Cause 2: this used to store nothing, so the card returned immediately.
    await expect(card(page)).toBeHidden();
    expect(Number(await readMarker(page))).toBeGreaterThan(0);

    await fireInstallPrompt(page, "dismissed");
    await expect(card(page)).toBeHidden();
  });

  test("accepting the install suppresses it permanently", async ({ page }) => {
    await fireInstallPrompt(page, "accepted");
    await card(page).getByRole("button", { name: /install/i }).click();

    // Cause 3: accepting used to clear the key entirely.
    await expect.poll(() => readMarker(page)).toBe("installed");

    await page.reload();
    await fireInstallPrompt(page, "accepted");
    await expect(card(page)).toBeHidden();
  });

  test("an install started from the browser menu also suppresses it", async ({ page }) => {
    await fireInstallPrompt(page);
    await expect(card(page)).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(card(page)).toBeHidden();
    expect(await readMarker(page)).toBe("installed");
  });

  test("re-offers the install once the 7-day snooze has expired", async ({ page }) => {
    await page.evaluate((key) => {
      window.localStorage.setItem(key, String(Date.now() - 8 * 24 * 60 * 60 * 1000));
    }, STORAGE_KEY);
    await page.reload();

    await fireInstallPrompt(page);
    await expect(card(page)).toBeVisible();
  });

  test("never shows when the app is already running standalone", async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) =>
        query.includes("standalone")
          ? {
              matches: true,
              media: query,
              onchange: null,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              dispatchEvent: () => false,
            }
          : real(query)) as typeof window.matchMedia;
    });
    await page.reload();

    await fireInstallPrompt(page);
    await expect(card(page)).toBeHidden();
  });

  test("stays dismissible for the session when the write is rejected", async ({ page }) => {
    /* Safari private mode and a full quota both make `setItem` throw while
       reads keep working, so the dismissal can never be persisted. The card
       must still stay closed for the rest of the session. */
    await page.addInitScript(() => {
      window.localStorage.setItem = () => {
        throw new Error("QuotaExceededError");
      };
    });
    await page.reload();

    await fireInstallPrompt(page);
    await expect(card(page)).toBeVisible();

    await dismissButton(page).click();
    await expect(card(page)).toBeHidden();

    await fireInstallPrompt(page);
    await expect(card(page)).toBeHidden();
  });

  test("survives a browser that blocks storage outright", async ({ page }) => {
    /* Chrome with site data blocked, and Firefox with dom.storage.enabled=false,
       throw on `window.localStorage` itself rather than on setItem. That used to
       take the whole page down to the global error boundary from ThemeProvider's
       hydration effect; the head shim in lib/storage-fallback.ts swaps in an
       in-memory Storage before anything reads it. */
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("SecurityError");
        },
      });
    });
    await page.reload();

    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await fireInstallPrompt(page);
    await expect(card(page)).toBeVisible();

    await dismissButton(page).click();
    await expect(card(page)).toBeHidden();
  });

  test("is suppressed on auth routes so it cannot cover the form", async ({ page }) => {
    await page.goto("/en/login");
    await fireInstallPrompt(page);
    await expect(card(page)).toBeHidden();
  });

  test("iOS gets the manual instructions instead of an install button", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/en");
    // No beforeinstallprompt on iOS — the card appears on its own timer.
    await page.waitForTimeout(IOS_SHOW_DELAY_MS + 1500);
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole("button", { name: /install/i })).toHaveCount(0);

    await dismissButton(page).click();
    await expect(card(page)).toBeHidden();
    await context.close();
  });
});
