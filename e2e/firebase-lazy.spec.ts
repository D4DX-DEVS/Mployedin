import { expect } from "@playwright/test";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { test } from "./fixtures/webkitServer";

/**
 * PECR: Firebase Auth must start only when the visitor clicks "Continue with
 * Google", keep nothing, and leave nothing behind.
 *
 * Run it against a PRODUCTION build (the dev server compiles differently and
 * proves less):
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack
 *   npx next start -p 3890
 *   E2E_BASE_URL=http://localhost:3890 npx playwright test e2e/firebase-lazy.spec.ts --project desktop-chromium --project iphone-webkit
 *
 * It runs in two Playwright projects (playwright.config.ts): `desktop-chromium`
 * and `iphone-webkit` (the iPhone profile on real WebKit when it is installed,
 * on Chromium otherwise). Each project's fixtures launch and close their own
 * browser, so the spec starts none itself; fixtures/webkitServer.ts bounds how
 * long closing WebKit may take on Windows. Any other project skips the spec.
 * Nothing here signs in to Google: in the click tests every request to a
 * Google host is aborted inside the browser before it leaves the machine.
 */

/** Google hosts Firebase Auth talks to: apis.google.com, *.firebaseapp.com, *.googleapis.com, accounts.google.com. */
const GOOGLE_HOST = /(^|\.)apis\.google\.com$|\.firebaseapp\.com$|\.googleapis\.com$|(^|\.)accounts\.google\.com$/;

/**
 * The Firebase authDomain the build was made with, when the run is given it
 * (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, or E2E_FIREBASE_AUTH_DOMAIN). A custom
 * domain would not match the Google hosts above, so the "/__/auth/" path that
 * Firebase serves its iframe and handler from is matched on any host too.
 */
const AUTH_DOMAIN_HOST = (() => {
  const raw = process.env.E2E_FIREBASE_AUTH_DOMAIN ?? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
})();

/** True for a request that goes to a Google host or to the Firebase auth domain. */
function isGoogleRequest(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return (
    GOOGLE_HOST.test(url.hostname) ||
    (AUTH_DOMAIN_HOST !== "" && url.hostname.toLowerCase() === AUTH_DOMAIN_HOST) ||
    url.pathname.startsWith("/__/auth/")
  );
}

/** IndexedDB databases Firebase creates on our origin. */
const FIREBASE_DB = /^firebase/i;

/**
 * While the page that started Firebase is alive, the library keeps its own
 * connection to this database open, so the browser cannot finish deleting it
 * until the page unloads (WebKit drops that delete when the page goes). No
 * supported option stops the library from creating it:
 * initializeApp(config, { automaticDataCollectionEnabled: false }) does not:
 * in @firebase/app dist/esm/index.esm.js the heartbeat service is registered
 * unconditionally (line 1219), every service request triggers it (270-276),
 * and its constructor opens the database (950-967); none of that reads the
 * flag, which is only stored on the app object (399-410). The page-load sweep
 * (StorageSweep) removes the database on the next page, on every engine.
 */
const HEARTBEAT_DB = "firebase-heartbeat-database";

const BLOCKED_MESSAGE = "Your browser blocked the Google window. Press the Google button again.";

/** The visible line under the Google button when it carries `text`. */
function noticeLine(page: Page, text: string): Locator {
  return page.locator("#google-window-notice", { hasText: text }).first();
}

/** The visually hidden polite live region that announces `text` to a screen reader. */
function announcement(page: Page, text: string): Locator {
  return page.locator('[aria-live="polite"]', { hasText: text });
}

interface BlockedPopupCounters {
  windowOpens: number;
  handshakes: number;
}

/**
 * Runs in the page before anything else, for the blocked-popup tests only.
 *
 * - `window.open` returns null the first time (what a browser does when the
 *   user activation has run out) and a closed window stub afterwards, or, for a
 *   browser that really blocks pop-ups, null every time.
 * - A stand-in for Google's `gapi.iframes` makes Firebase's handshake succeed
 *   without any request to a Google host, so the flow reaches `window.open`
 *   exactly as it does on a real connection; `handshakes` counts how often
 *   Firebase opened its Google iframe.
 */
function BLOCKED_POPUP_FAKES(alwaysBlocked: boolean): void {
  const state = { windowOpens: 0, handshakes: 0 };
  (window as unknown as { __e2e: typeof state }).__e2e = state;
  window.open = () => {
    state.windowOpens += 1;
    return alwaysBlocked || state.windowOpens === 1 ? null : ({ closed: true, focus() {}, close() {} } as unknown as Window);
  };
  const iframe = {
    restyle: async () => {},
    ping: (callback: () => void) => {
      callback();
      return Promise.resolve();
    },
    register: () => {},
    send: () => {},
  };
  (window as unknown as { gapi: unknown }).gapi = {
    iframes: {
      Iframe: function Iframe() {},
      CROSS_ORIGIN_IFRAMES_FILTER: () => true,
      getContext: () => ({
        open: (_params: unknown, callback: (frame: typeof iframe) => unknown) => {
          state.handshakes += 1;
          return callback(iframe);
        },
      }),
    },
  };
}

interface PageUnderTest {
  name: string;
  path: (jobId: string) => string;
  googleButton: (page: Page) => Promise<Locator>;
  /** What the visitor is told when the browser blocks the Google window twice in a row. */
  popupGuidance: string;
}

const ALLOW_POPUPS = "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";

const PAGES: PageUnderTest[] = [
  {
    name: "/en/login",
    path: () => "/en/login",
    googleButton: async (page) => page.getByRole("button", { name: "Continue with Google" }),
    popupGuidance: ALLOW_POPUPS,
  },
  {
    name: "/en/register",
    path: () => "/en/register",
    googleButton: async (page) => {
      // The form sits behind the "Find a job / Hire talent" chooser.
      await page.getByText("Find a job", { exact: true }).click();
      return page.getByRole("button", { name: "Google", exact: true });
    },
    popupGuidance: ALLOW_POPUPS,
  },
  {
    name: "a public job page",
    path: (jobId) => `/en/jobs/${jobId}`,
    googleButton: async (page) => page.getByRole("button", { name: "Continue with Google" }).first(),
    popupGuidance: "Your browser blocked the Google sign-in popup. Try using email instead.",
  },
];

/** Waits for the network to go quiet (best effort: a slow data request must not fail the check), then a fixed pause. */
async function settle(page: Page, pauseMs: number): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(pauseMs);
}

async function firebaseDatabases(page: Page): Promise<string[]> {
  return page.evaluate(async (pattern) => {
    const databases = await indexedDB.databases();
    return databases.map((db) => db.name ?? "").filter((name) => new RegExp(pattern, "i").test(name));
  }, FIREBASE_DB.source);
}

/** Firebase databases other than the library's heartbeat one (see HEARTBEAT_DB). */
async function databasesBesidesHeartbeat(page: Page): Promise<string[]> {
  return (await firebaseDatabases(page)).filter((name) => name !== HEARTBEAT_DB);
}

/** Opens and closes the two databases the old code left on a device that signed in with Google. */
async function seedLegacyDatabases(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      ["firebaseLocalStorageDb", "firebase-heartbeat-database"].map(
        (name) =>
          new Promise<void>((resolve) => {
            const open = indexedDB.open(name);
            open.onsuccess = () => {
              open.result.close();
              resolve();
            };
            open.onerror = () => resolve();
          }),
      ),
    );
  });
}

interface StorageKeys {
  local: string[];
  session: string[];
  cookies: string[];
}

async function storageKeys(page: Page): Promise<StorageKeys> {
  const { local, session } = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  const cookies = (await page.context().cookies()).map((cookie) => cookie.name);
  return { local, session, cookies };
}

/** Keys and cookies present in `after` that were not in `before`. */
function addedKeys(before: StorageKeys, after: StorageKeys): StorageKeys {
  const added = (was: string[], now: string[]) => now.filter((key) => !was.includes(key));
  return {
    local: added(before.local, after.local),
    session: added(before.session, after.session),
    cookies: added(before.cookies, after.cookies),
  };
}

const NOTHING_ADDED: StorageKeys = { local: [], session: [], cookies: [] };

/** The popup counters BLOCKED_POPUP_FAKES keeps on the page. */
const blockedCounters = (page: Page) => page.evaluate(() => (window as unknown as { __e2e: BlockedPopupCounters }).__e2e);

interface Opened {
  button: Locator;
  /** Every request the page made to a Google host (all of them are aborted). */
  googleRequests: string[];
}

/**
 * Opens the page under test with every request to Google aborted inside the
 * browser (and recorded), waits for its Google button and for the network to go
 * quiet. `alwaysBlocked` installs the blocked-popup fakes: false = the first
 * window is blocked, true = every one is.
 */
async function openTarget(
  { context, page }: { context: BrowserContext; page: Page },
  target: PageUnderTest,
  jobId: string,
  alwaysBlocked?: boolean,
): Promise<Opened> {
  test.skip(!jobId && target.name === "a public job page", "no public job found to open");
  await context.route((url) => isGoogleRequest(url.href), (route) => route.abort());
  const googleRequests: string[] = [];
  context.on("request", (request) => {
    if (isGoogleRequest(request.url())) googleRequests.push(request.url());
  });
  if (alwaysBlocked !== undefined) await context.addInitScript(BLOCKED_POPUP_FAKES, alwaysBlocked);
  await page.goto(target.path(jobId), { waitUntil: "load" });
  const button = await target.googleButton(page);
  await expect(button).toBeVisible();
  await settle(page, 1_000);
  return { button, googleRequests };
}

/** After a reload every Firebase database is gone, on this engine: the page-load sweep. */
async function expectSweptAfterReload(page: Page, engine: string): Promise<void> {
  await page.reload({ waitUntil: "load" });
  await expect
    .poll(() => firebaseDatabases(page), { timeout: 15_000, message: `Firebase IndexedDB after a reload (${engine})` })
    .toEqual([]);
}

/** Firebase was disposed: no sign-in database remains and the library added no key or cookie of its own. */
async function expectDisposed(page: Page, before: StorageKeys): Promise<void> {
  await expect.poll(() => databasesBesidesHeartbeat(page), { timeout: 15_000 }).toEqual([]);
  expect(addedKeys(before, await storageKeys(page)), "storage keys and cookies added by Firebase").toEqual(NOTHING_ADDED);
}

const PROJECTS = ["desktop-chromium", "iphone-webkit"];

test.describe("Firebase loads only on click and keeps nothing", () => {
  // The longest waits inside a test add up (a 15 s poll, another 15 s poll and a
  // 30 s wait for the button, plus page loads), so the default 30 s would cut a
  // slow run off in the middle of one and hide which assertion was waiting.
  test.describe.configure({ timeout: 120_000 });

  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(!PROJECTS.includes(testInfo.project.name), "runs in desktop-chromium and iphone-webkit only");
  });

  let jobId = "";
  test.beforeAll(async ({ request }) => {
    // A live public job, read from the public listing (read-only).
    const listing = await request.get("/en/jobs");
    const match = (await listing.text()).match(/\/en\/jobs\/([a-f0-9]{24})/);
    jobId = process.env.E2E_PUBLIC_JOB_ID ?? match?.[1] ?? "";
  });

  for (const target of PAGES) {
    test(`${target.name}: loading and warming the Google button starts no Firebase`, async ({ context, page }) => {
      const { button, googleRequests } = await openTarget({ context, page }, target, jobId);

      // Opening the page alone.
      expect(await firebaseDatabases(page), "Firebase IndexedDB after load").toEqual([]);
      expect(googleRequests, "requests to Google hosts after load").toEqual([]);

      // The warm-up: hover, keyboard focus and a touch on the button.
      await button.hover();
      await button.focus();
      await button.dispatchEvent("touchstart");
      await settle(page, 1_500);

      expect(await firebaseDatabases(page), "Firebase IndexedDB after warm-up").toEqual([]);
      expect(googleRequests, "requests to Google hosts after warm-up").toEqual([]);
      const keys = await storageKeys(page);
      expect(
        [...keys.local, ...keys.session, ...keys.cookies].filter((key) => /firebase|gapi/i.test(key)),
        "Firebase keys in storage and cookies",
      ).toEqual([]);
    });

    // A device that signed in with Google before this change still has the two
    // Firebase databases. The next page load removes them, with no click and
    // without waking Firebase.
    test(`${target.name}: the page-load sweep removes Firebase databases an earlier visit left`, async ({ context, page, browserName }) => {
      // Opening settles the page, so its own sweep (it runs once hydration is
      // done) has finished and cannot remove what is seeded next.
      const { googleRequests } = await openTarget({ context, page }, target, jobId);
      await seedLegacyDatabases(page);
      expect(await firebaseDatabases(page), "seeded legacy databases").toHaveLength(2);

      await expectSweptAfterReload(page, browserName);

      await settle(page, 1_000);
      expect(googleRequests, "requests to Google hosts during the sweep").toEqual([]);
    });

    test(`${target.name}: clicking it starts Firebase, then removes what it created`, async ({ context, page, browserName }) => {
      const { button, googleRequests } = await openTarget({ context, page }, target, jobId);

      // A visitor who signed in with Google before this change still has
      // Firebase's databases from the old code. (Seeded after the page-load
      // sweep has run, so the click is what has to remove them.)
      await seedLegacyDatabases(page);
      expect(await firebaseDatabases(page), "seeded legacy databases").toHaveLength(2);
      const before = await storageKeys(page);

      await button.click();

      // Control: the click is what wakes Firebase, so this proves the
      // request listener can see it.
      await expect.poll(() => googleRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
      // The attempt fails (Google is unreachable here) and Firebase is disposed:
      // the databases from the old code are gone straight away and the library
      // left no key or cookie of its own behind.
      await expect(button).toBeEnabled({ timeout: 30_000 });
      await expectDisposed(page, before);

      // The heartbeat database is the library's own connection (see
      // HEARTBEAT_DB). The next page load removes it, on every engine.
      await expectSweptAfterReload(page, browserName);
    });

    test(`${target.name}: a blocked Google window is explained inline, and pressing again opens it without a second handshake`, async ({ context, page, browserName }) => {
      const { button } = await openTarget({ context, page }, target, jobId, false);
      const before = await storageKeys(page);
      const blockedMessage = noticeLine(page, BLOCKED_MESSAGE);
      const announced = announcement(page, BLOCKED_MESSAGE);
      await expect(announced, "nothing is announced before the window is blocked").toHaveCount(0);

      // First click: Firebase's handshake (faked) finishes, then window.open
      // returns null, which Firebase reports as a blocked popup.
      await button.click();
      await expect(blockedMessage).toBeVisible({ timeout: 15_000 });
      await expect(announced, "a screen reader is told once, from the live region").toHaveCount(1);
      await expect(blockedMessage, "the visible line is not read a second time").toHaveAttribute("aria-hidden", "true");
      expect(await blockedCounters(page), "after the blocked click").toEqual({ windowOpens: 1, handshakes: 1 });
      // The message is inline text, not a toast, and the button works again.
      await expect(button).toBeEnabled();
      // Nothing is persisted while Firebase is kept for the retry (the library's own
      // heartbeat database is not sign-in data; it goes with the next page load).
      expect(await databasesBesidesHeartbeat(page), "Firebase IndexedDB while kept for the retry").toEqual([]);
      await page.waitForTimeout(1_500);
      await expect(blockedMessage, "the message stays until the next click").toBeVisible();

      // Retry: Firebase's popup resolver caches the Google handshake for the page,
      // so the window opens straight away with no second handshake, and the old
      // message is gone. (The kept instance does not make this fast; it lets a
      // second block be recognised, see the next test.)
      await button.click();
      await expect.poll(async () => (await blockedCounters(page)).windowOpens, { timeout: 15_000 }).toBe(2);
      expect((await blockedCounters(page)).handshakes, "handshakes after the retry").toBe(1);
      await expect(blockedMessage).toBeHidden();
      await expect(announced).toHaveCount(0);

      // The retry ends (its popup is a closed stub, and Google is unreachable):
      // Firebase is disposed and leaves nothing behind.
      await expect(button).toBeEnabled({ timeout: 30_000 });
      await expectDisposed(page, before);
      await expectSweptAfterReload(page, browserName);
    });

    // "Press again" is right once. On the retry the handshake is done and the
    // window is opened inside the click, so a block on that same instance is the
    // browser's pop-up blocker: the visitor gets the allow-pop-ups guidance instead.
    test(`${target.name}: a browser that always blocks pop-ups is told to allow them, not to press again`, async ({ context, page, browserName }) => {
      const { button } = await openTarget({ context, page }, target, jobId, true);
      const before = await storageKeys(page);
      const blockedMessage = noticeLine(page, BLOCKED_MESSAGE);
      const guidance = page.getByText(target.popupGuidance);

      await button.click();
      await expect(blockedMessage).toBeVisible({ timeout: 15_000 });
      await expect(guidance).toBeHidden();

      await button.click();
      await expect(guidance).toBeVisible({ timeout: 15_000 });
      await expect(blockedMessage, "no third 'press again'").toBeHidden();
      expect(await blockedCounters(page), "the retry opened its window without a second handshake").toEqual({ windowOpens: 2, handshakes: 1 });
      await expect(button).toBeEnabled({ timeout: 30_000 });

      // It was a real blocker, so Firebase was disposed.
      await expectDisposed(page, before);
      await expectSweptAfterReload(page, browserName);
    });
  }
});
