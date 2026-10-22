import { chromium, devices, expect, test, webkit } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * PECR: a YouTube video must not load, and YouTube/Google must receive nothing,
 * until the visitor asks for it.
 *
 * The dev database has no landing video, so the CMS fetch (/api/public/landing)
 * is answered inside the browser with two YouTube records; nothing is written to
 * any database. The consent receipt the banner and the settings dialog post
 * (/api/consent/receipt) is answered with a 204 for the same reason (the spec
 * records each body, so it can check what "Always play videos" sends), and every
 * request to a YouTube/Google video host is answered with an empty page inside
 * the browser, so nothing leaves the machine. The request listener still sees
 * each one, which is what the assertions read.
 *
 * Run it against a PRODUCTION build (the dev server compiles differently and
 * proves less):
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack
 *   npx next start -p 3890
 *   E2E_BASE_URL=http://localhost:3890 npx playwright test e2e/youtube-facade.spec.ts --project desktop-chromium
 *
 * The spec launches its own browsers (desktop Chromium and an iPhone profile,
 * WebKit when it is installed), so it runs once, under `desktop-chromium`.
 */

/** Every host the Videos choice is about: the player, its privacy-enhanced twin, thumbnails and the video CDN. */
const VIDEO_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)$/;

const FIRST = { id: "dQw4w9WgXcQ", title: "How to apply" };
const SECOND = { id: "9bZkp7q19f0", title: "Hiring talent" };

const LANDING_PAYLOAD = {
  faqs: [],
  banners: [],
  testimonials: [],
  recentPosts: [],
  stats: null,
  videos: [
    { _id: "e2e-video-1", title: FIRST.title, titleAr: "كيف تقدّم", description: "", descriptionAr: "", url: `https://www.youtube.com/watch?v=${FIRST.id}` },
    { _id: "e2e-video-2", title: SECOND.title, titleAr: "التوظيف", description: "", descriptionAr: "", url: `https://youtu.be/${SECOND.id}` },
  ],
};

const PLAY = "Play video (loads YouTube)";
const PLAY_AR = "تشغيل الفيديو (يحمّل YouTube)";
const NOCOOKIE_FRAMES = 'iframe[src^="https://www.youtube-nocookie.com/embed/"]';
const ANY_YOUTUBE_FRAMES = 'iframe[src*="youtube"]';

interface Profile {
  label: string;
  launch: () => Promise<{ browser: Browser; engine: string }>;
  device: (typeof devices)[string];
}

const PROFILES: Profile[] = [
  {
    label: "desktop Chromium",
    launch: async () => ({ browser: await chromium.launch(), engine: "Chromium" }),
    device: devices["Desktop Chrome"],
  },
  {
    label: "iPhone",
    // Real WebKit when it is installed; otherwise Chromium wearing the iPhone profile.
    launch: async () => {
      try {
        return { browser: await webkit.launch(), engine: "WebKit" };
      } catch {
        return { browser: await chromium.launch(), engine: "Chromium with the iPhone user agent" };
      }
    },
    device: devices["iPhone 14"],
  },
];

interface Visitor {
  context: BrowserContext;
  page: Page;
  /** Every request to a video host, in order. */
  videoRequests: string[];
  /** Console messages that name the Content Security Policy. */
  cspMessages: string[];
  /** Bodies of the consent receipts the page posted (answered with a 204, never stored). */
  receipts: Array<Record<string, unknown>>;
}

async function newVisitor(browser: Browser, device: Profile["device"], baseURL: string | undefined): Promise<Visitor> {
  const context = await browser.newContext({ ...device, baseURL });
  const videoRequests: string[] = [];
  const cspMessages: string[] = [];
  // Never reach YouTube/Google: the stand-in page is what the iframe loads.
  await context.route((url) => VIDEO_HOST.test(url.hostname), (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stand-in</title>" }),
  );
  // No database writes: the landing content and the consent receipt are answered here.
  await context.route("**/api/public/landing", (route) => route.fulfill({ json: LANDING_PAYLOAD }));
  const receipts: Array<Record<string, unknown>> = [];
  await context.route("**/api/consent/receipt", (route) => {
    receipts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 204 });
  });
  context.on("request", (request) => {
    if (VIDEO_HOST.test(new URL(request.url()).hostname)) videoRequests.push(request.url());
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) cspMessages.push(message.text());
  });
  return { context, page, videoRequests, cspMessages, receipts };
}

/** Waits for the network to go quiet (best effort), then a fixed pause. */
async function settle(page: Page, pauseMs: number): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(pauseMs);
}

async function consentCookie(context: BrowserContext): Promise<{ preferences: boolean; media: boolean } | undefined> {
  const cookie = (await context.cookies()).find((c) => c.name === "mpl_consent");
  return cookie ? JSON.parse(decodeURIComponent(cookie.value)) : undefined;
}

/** Cookie settings from the public footer, then the Videos switch and Save. */
async function saveCookieSettings(page: Page, options: { videos: boolean }): Promise<void> {
  await page.locator("footer").getByRole("button", { name: "Cookie settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie settings" });
  const videos = dialog.getByRole("switch", { name: "Videos from YouTube" });
  await expect(videos).toBeVisible();
  if ((await videos.getAttribute("aria-checked")) !== String(options.videos)) await videos.click();
  await dialog.getByRole("button", { name: "Save choices" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("YouTube videos load only on a click", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "launches its own browsers; runs once");
  });

  for (const profile of PROFILES) {
    test.describe(profile.label, () => {
      let browser: Browser;
      // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring pattern
      test.beforeAll(async ({}, testInfo) => {
        const launched = await profile.launch();
        browser = launched.browser;
        testInfo.annotations.push({ type: "engine", description: `${profile.label}: ${launched.engine}` });
      });
      test.afterAll(async () => {
        // Closing WebKit on Windows can take a while.
        test.setTimeout(120_000);
        await browser?.close().catch(() => {});
      });

      test("nothing reaches YouTube before the click; Play loads one nocookie iframe and keeps the choice unset", async ({ baseURL }) => {
        const { context, page, videoRequests, cspMessages } = await newVisitor(browser, profile.device, baseURL);
        await page.goto("/en", { waitUntil: "load" });
        const play = page.getByRole("button", { name: PLAY });
        await expect(play).toHaveCount(2);
        await settle(page, 1_500);

        // Opening the page alone: no iframe, no request to any video host, no cookie.
        expect(videoRequests, "requests to YouTube/Google video hosts after load").toEqual([]);
        await expect(page.locator(ANY_YOUTUBE_FRAMES)).toHaveCount(0);
        await expect(page.locator("img[src*='ytimg']")).toHaveCount(0);
        expect(await consentCookie(context), "consent cookie after load").toBeUndefined();
        await expect(page.getByText(FIRST.title).first()).toBeVisible();

        // Scrolling the videos into view still loads nothing.
        await play.first().scrollIntoViewIfNeeded();
        await settle(page, 1_000);
        expect(videoRequests, "requests after scrolling to the videos").toEqual([]);

        // The click is what wakes YouTube: exactly one iframe, on the privacy-enhanced host.
        await play.first().click();
        await expect(page.locator(NOCOOKIE_FRAMES)).toHaveCount(1);
        await expect(page.locator(`iframe[title="${FIRST.title}"]`)).toHaveAttribute(
          "src",
          new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${FIRST.id}`),
        );
        await expect.poll(() => videoRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
        expect(
          videoRequests.every((url) => new URL(url).hostname === "www.youtube-nocookie.com"),
          `only the privacy-enhanced host was contacted: ${videoRequests.join(", ")}`,
        ).toBe(true);
        // The other video is still a placeholder, and the site-wide choice is still unset.
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(1);
        await expect(page.locator(ANY_YOUTUBE_FRAMES)).toHaveCount(1);
        expect(await consentCookie(context), "consent cookie after one click").toBeUndefined();
        // The CSP lets that frame load.
        expect(cspMessages, "Content-Security-Policy violations").toEqual([]);
        await context.close();
      });

      test("withdrawing Videos removes a video played by one click", async ({ baseURL }) => {
        const { context, page, cspMessages } = await newVisitor(browser, profile.device, baseURL);
        await page.goto("/en", { waitUntil: "load" });
        await page.getByRole("button", { name: PLAY }).first().click();
        await expect(page.locator(NOCOOKIE_FRAMES)).toHaveCount(1);

        // Saving the dialog with Videos off is a "Videos: off" choice: the frame goes.
        await saveCookieSettings(page, { videos: false });
        await expect(page.locator(ANY_YOUTUBE_FRAMES)).toHaveCount(0);
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(2);
        expect(await consentCookie(context)).toMatchObject({ media: false });
        expect(cspMessages).toEqual([]);
        await context.close();
      });

      test("turning Videos on plays them without a click, and turning it off removes them", async ({ baseURL }) => {
        const { context, page, videoRequests, cspMessages } = await newVisitor(browser, profile.device, baseURL);
        await page.goto("/en", { waitUntil: "load" });
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(2);
        expect(videoRequests).toEqual([]);

        // Accept all on the banner turns Videos on: both videos load with no click.
        await page.locator("[data-cookie-consent]").getByRole("button", { name: "Accept all" }).click();
        await expect(page.locator(NOCOOKIE_FRAMES)).toHaveCount(2);
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);
        expect(await consentCookie(context)).toMatchObject({ media: true });

        // Withdraw Videos in Cookie settings: both frames are gone and the placeholders are back.
        await saveCookieSettings(page, { videos: false });
        await expect(page.locator(ANY_YOUTUBE_FRAMES)).toHaveCount(0);
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(2);
        expect(await consentCookie(context)).toMatchObject({ media: false });

        // The dialog is honest that withdrawing recalls nothing already sent.
        await page.locator("footer").getByRole("button", { name: "Cookie settings" }).click();
        const dialog = page.getByRole("dialog", { name: "Cookie settings" });
        await expect(dialog.getByText(/can't recall what YouTube has already received/)).toBeVisible();
        expect(cspMessages).toEqual([]);
        await context.close();
      });

      test("Always play videos is a recorded choice: Videos on for the site, one receipt, the banner closes, it survives a reload", async ({ baseURL }) => {
        const { context, page, cspMessages, receipts } = await newVisitor(browser, profile.device, baseURL);
        await page.goto("/en", { waitUntil: "load" });
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(2);
        // The cookie banner is asking until a choice is made.
        await expect(page.locator("[data-cookie-consent]")).toBeVisible();
        expect(receipts).toEqual([]);

        await page.getByRole("checkbox", { name: "Always play videos" }).first().click();
        await expect(page.locator(NOCOOKIE_FRAMES)).toHaveCount(2);
        const choice = await consentCookie(context);
        expect(choice).toMatchObject({ media: true });

        // The choice answered the banner, and it was receipted like any other: one POST, Videos on,
        // display settings left at the default (no earlier choice), tied to the stored choice id.
        await expect(page.locator("[data-cookie-consent]")).toHaveCount(0);
        await expect.poll(() => receipts.length, { timeout: 10_000 }).toBe(1);
        expect(receipts[0]).toEqual({
          receiptId: (choice as unknown as { id: string }).id,
          preferences: true,
          media: true,
          version: 1,
          locale: "en",
          source: "settings",
        });
        await page.waitForTimeout(500);
        expect(receipts, "no second receipt").toHaveLength(1);

        await page.reload({ waitUntil: "load" });
        await expect(page.locator(NOCOOKIE_FRAMES)).toHaveCount(2);
        await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);
        expect(cspMessages).toEqual([]);
        await context.close();
      });

      // The placeholder and the player share one 16:9 frame, so pressing Play must not move the page below.
      // Desktop Chromium walks the widths that matter; the iPhone profile keeps its own 390px viewport.
      const WIDTHS = profile.label === "desktop Chromium" ? [375, 768, 1280] : [null];
      for (const [path, play] of [["/en", PLAY], ["/ar", PLAY_AR]] as const) {
        for (const width of WIDTHS) {
          test(`${path}${width ? ` at ${width}px` : ""}: the card keeps its height when Play is pressed`, async ({ baseURL }) => {
            const device = width ? { ...profile.device, viewport: { width, height: 900 } } : profile.device;
            const { context, page } = await newVisitor(browser, device, baseURL);
            await page.goto(path, { waitUntil: "load" });
            const button = page.getByRole("button", { name: play });
            await expect(button).toHaveCount(2);
            await settle(page, 500);
            // The first video's card; the Play button inside it goes away on the click, so don't find the card through it.
            const card = page.locator("article:has([data-youtube-frame])").first();
            const frame = card.locator("[data-youtube-frame]");
            await card.scrollIntoViewIfNeeded();

            const before = { card: (await card.boundingBox())!, frame: (await frame.boundingBox())! };
            // The controls fit the 16:9 frame; if they did not, the frame would be taller than the ratio.
            expect(Math.abs(before.frame.height - (before.frame.width * 9) / 16), "placeholder frame is exactly 16:9").toBeLessThanOrEqual(2);

            await button.first().click();
            await expect(card.locator(NOCOOKIE_FRAMES)).toHaveCount(1);
            await page.waitForTimeout(300);
            const after = { card: (await card.boundingBox())!, frame: (await frame.boundingBox())! };

            expect(Math.abs(after.frame.height - before.frame.height), `frame ${before.frame.height} -> ${after.frame.height}`).toBeLessThanOrEqual(2);
            expect(Math.abs(after.card.height - before.card.height), `card ${before.card.height} -> ${after.card.height}`).toBeLessThanOrEqual(2);
            expect(Math.abs(after.frame.width - before.frame.width)).toBeLessThanOrEqual(1);
            await context.close();
          });
        }
      }

      test("the Arabic page shows the placeholder right-to-left with touch-sized controls", async ({ baseURL }) => {
        const { context, page, videoRequests } = await newVisitor(browser, profile.device, baseURL);
        await page.goto("/ar", { waitUntil: "load" });
        const play = page.getByRole("button", { name: PLAY_AR });
        await expect(play).toHaveCount(2);
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        await settle(page, 1_000);
        expect(videoRequests, "requests to video hosts on the Arabic page").toEqual([]);

        await play.first().scrollIntoViewIfNeeded();
        const card = play.first().locator("xpath=ancestor::article[1]");
        const controls = [
          play.first(),
          card.getByRole("checkbox", { name: "تشغيل مقاطع الفيديو دائمًا" }).locator("xpath=ancestor::label[1]"),
          card.getByRole("link", { name: "المشاهدة على YouTube" }),
        ];
        for (const control of controls) {
          const box = await control.boundingBox();
          expect(box, "control is rendered").not.toBeNull();
          expect(box!.height, "touch target height").toBeGreaterThanOrEqual(44);
        }
        // Nothing pushes the page sideways.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        await play.first().click();
        await expect(page.locator(NOCOOKIE_FRAMES)).toHaveCount(1);
        await context.close();
      });
    });
  }
});
