import { devices, expect } from "@playwright/test";
import type { Browser, BrowserContext, BrowserContextOptions, Cookie, Locator, Page } from "@playwright/test";
import { HostRecorder, hostRowFor } from "./inventory";

/**
 * Shared set-up for the cookie-consent E2E: the two device profiles, a fresh
 * context per case with nothing leaving the machine, and the banner / dialog
 * handles in English and Arabic.
 *
 * Nothing here writes to a database:
 *  - the consent receipt (POST /api/consent/receipt) is answered in the browser
 *    (204 by default, or a chosen status) and its body recorded;
 *  - the language switcher's PATCH /api/users/locale is answered with a 204;
 *  - every third-party request is recorded, then aborted, except our own file
 *    storage (registry rows marked strictly necessary), which may load.
 */

export interface Profile {
  label: string;
  options: BrowserContextOptions;
}

export const DESKTOP: Profile = {
  label: "1440 desktop",
  options: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
};

/** iPhone user agent, touch and pixel ratio, 375 wide; on the project's Chromium. */
export const IPHONE: Profile = {
  label: "375 iPhone",
  options: (() => {
    const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];
    return { ...iphone, viewport: { width: 375, height: 812 }, screen: { width: 375, height: 812 } };
  })(),
};

export const PROFILES = [DESKTOP, IPHONE];

export interface Copy {
  rejectAll: string;
  acceptAll: string;
  customise: string;
  settingsTitle: string;
  save: string;
  footerSettings: string;
  preferences: string;
  media: string;
}

export const EN: Copy = {
  rejectAll: "Reject all",
  acceptAll: "Accept all",
  customise: "Customise",
  settingsTitle: "Cookie settings",
  save: "Save choices",
  footerSettings: "Cookie settings",
  preferences: "Remember my display settings",
  media: "Videos from YouTube",
};

export const AR: Copy = {
  rejectAll: "رفض الكل",
  acceptAll: "قبول الكل",
  customise: "تخصيص",
  settingsTitle: "إعدادات ملفات تعريف الارتباط",
  save: "حفظ الاختيارات",
  footerSettings: "إعدادات ملفات تعريف الارتباط",
  preferences: "تذكّر إعدادات العرض الخاصة بي",
  media: "مقاطع الفيديو من YouTube",
};

export interface Visitor {
  context: BrowserContext;
  page: Page;
  hosts: HostRecorder;
  /** Bodies of the consent receipts the page posted. */
  receipts: Array<Record<string, unknown>>;
  /** Status the receipt stub answers with (204 unless a case changes it). */
  receiptStatus: { value: number };
  close: () => Promise<void>;
}

export interface VisitorOptions {
  /** Answer GET /api/public/landing with this body (the dev DB has no CMS video). */
  landing?: unknown;
  /** Answer the YouTube hosts with a stand-in page instead of aborting them. */
  videoStandIn?: boolean;
}

const VIDEO_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)$/;

export async function newVisitor(browser: Browser, profile: Profile, baseURL: string, options: VisitorOptions = {}): Promise<Visitor> {
  const context = await browser.newContext({ ...profile.options, baseURL });
  const hosts = await HostRecorder.attach(context, baseURL);
  const origin = new URL(baseURL).host;

  // Third parties: recorded by HostRecorder (the request event fires before routing), then stopped here.
  await context.route(
    (url) => url.host !== origin && /^https?:$/.test(url.protocol),
    (route) => {
      const url = new URL(route.request().url());
      if (options.videoStandIn && VIDEO_HOST.test(url.hostname)) {
        return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stand-in</title>" });
      }
      return hostRowFor(url)?.basis === "strictly-necessary" ? route.continue() : route.abort();
    },
  );
  const receipts: Array<Record<string, unknown>> = [];
  const receiptStatus = { value: 204 };
  await context.route("**/api/consent/receipt", (route) => {
    receipts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: receiptStatus.value, contentType: "application/json", body: receiptStatus.value === 204 ? undefined : '{"error":"stubbed"}' });
  });
  await context.route("**/api/users/locale", (route) => route.fulfill({ status: 204 }));
  if (options.landing !== undefined) {
    const body = options.landing;
    await context.route("**/api/public/landing", (route) => route.fulfill({ json: body }));
  }
  const page = await context.newPage();
  return { context, page, hosts, receipts, receiptStatus, close: () => context.close() };
}

/** Waits for the network to go quiet (best effort), then a fixed pause. */
export async function settle(page: Page, pauseMs = 1_000): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(pauseMs);
}

/** Scrolls to the bottom in steps (lazy sections load) and back to the top. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
}

export function banner(page: Page): Locator {
  return page.locator("[data-cookie-consent]");
}

export function bannerButton(page: Page, name: string): Locator {
  return banner(page).getByRole("button", { name, exact: true });
}

export function settingsDialog(page: Page, copy: Copy = EN): Locator {
  return page.getByRole("dialog", { name: copy.settingsTitle });
}

/** The public footer's Cookie settings button. */
export function footerSettings(page: Page, copy: Copy = EN): Locator {
  return page.locator("footer").getByRole("button", { name: copy.footerSettings });
}

export interface ConsentCookie {
  id: string;
  preferences: boolean;
  media: boolean;
  v: number;
}

export async function consentCookie(context: BrowserContext): Promise<ConsentCookie | undefined> {
  const cookie = (await context.cookies()).find((c) => c.name === "mpl_consent");
  return cookie ? (JSON.parse(decodeURIComponent(cookie.value)) as ConsentCookie) : undefined;
}

export async function cookieNamed(context: BrowserContext, name: string): Promise<Cookie | undefined> {
  return (await context.cookies()).find((c) => c.name === name);
}

/** Sets the switch to `on` if it is not already. */
export async function setSwitch(control: Locator, on: boolean): Promise<void> {
  await expect(control).toBeVisible();
  if ((await control.getAttribute("aria-checked")) !== String(on)) await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(on));
}

/** A public job id from the listing (read-only), or E2E_PUBLIC_JOB_ID. */
export async function findPublicJobId(baseURL: string): Promise<string> {
  if (process.env.E2E_PUBLIC_JOB_ID) return process.env.E2E_PUBLIC_JOB_ID;
  try {
    const res = await fetch(new URL("/en/jobs", baseURL));
    return (await res.text()).match(/\/en\/jobs\/([a-f0-9]{24})/)?.[1] ?? "";
  } catch {
    return "";
  }
}

export const LANDING_WITH_VIDEOS = {
  faqs: [],
  banners: [],
  testimonials: [],
  recentPosts: [],
  stats: null,
  videos: [
    { _id: "e2e-video-1", title: "How to apply", titleAr: "كيف تقدّم", description: "", descriptionAr: "", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { _id: "e2e-video-2", title: "Hiring talent", titleAr: "التوظيف", description: "", descriptionAr: "", url: "https://youtu.be/9bZkp7q19f0" },
  ],
};

export const NOCOOKIE_FRAMES = 'iframe[src^="https://www.youtube-nocookie.com/embed/"]';
export const ANY_YOUTUBE_FRAMES = 'iframe[src*="youtube"]';
