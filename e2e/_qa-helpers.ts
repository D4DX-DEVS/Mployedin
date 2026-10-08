import type { Page, TestInfo } from "@playwright/test";
import fs from "fs";
import path from "path";

export const OUT = "qa-reports/screens/jobseeker";
export const LOG = "qa-reports/tmp/jobseeker-log.jsonl";
export const SEEKER = { email: "jobseeker@mployedin.com", password: "JobSeeker@1234" };

export function note(obj: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");
}

export function attachProbes(page: Page, tag: string) {
  const state = { url: "", errs: [] as string[] };
  page.on("console", (m) => { if (m.type() === "error") state.errs.push(`console: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => state.errs.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    const s = r.status();
    const u = r.url();
    if (s >= 400 && !u.includes("_next/webpack-hmr")) state.errs.push(`http ${s} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
  });
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (!/ERR_ABORTED/.test(f)) state.errs.push(`reqfail ${f} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`);
  });
  return {
    flush(step: string) {
      const errs = [...new Set(state.errs)];
      state.errs.length = 0;
      if (errs.length) note({ tag, step, url: page.url(), errs });
      return errs;
    },
  };
}

export async function shot(page: Page, name: string, full = true) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch((e) => note({ step: name, shotErr: String(e) }));
}

export async function visit(page: Page, probes: ReturnType<typeof attachProbes>, name: string, url: string, opts: { full?: boolean } = {}) {
  const t0 = Date.now();
  let status: number | undefined;
  try {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    status = r?.status();
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(600);
  } catch (e) {
    note({ step: name, url, gotoErr: String(e).slice(0, 200) });
  }
  const info = await page.evaluate(() => {
    const imgs = Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(0, 120));
    const h1s = Array.from(document.querySelectorAll("h1")).map((h) => (h as HTMLElement).innerText.trim().slice(0, 80));
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
    const desc = document.querySelector('meta[name="description"]')?.getAttribute("content")?.slice(0, 100) ?? null;
    const bodyText = document.body.innerText;
    const rawKeys = (bodyText.match(/\b[a-z]+[A-Z][a-zA-Z]+\.[a-zA-Z.]+\b/g) || []).slice(0, 8);
    return { title: document.title, h1s, brokenImgs: imgs, overflowX, scrollW: document.documentElement.scrollWidth, vw: window.innerWidth, desc, dir: document.documentElement.dir, lang: document.documentElement.lang, rawKeys, textLen: bodyText.length };
  }).catch((e) => ({ evalErr: String(e) }));
  await shot(page, name, opts.full ?? true);
  const errs = probes.flush(name);
  note({ step: name, url, finalUrl: page.url(), status, ms: Date.now() - t0, ...info, errCount: errs.length });
  return info;
}

export async function login(page: Page, email = SEEKER.email, password = SEEKER.password, locale = "en") {
  for (let i = 0; i < 2; i++) {
    await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
    await page.locator("#email").waitFor({ timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click("button[type=submit]");
    try {
      await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return true;
    } catch {
      note({ step: "login-retry", email, attempt: i, url: page.url() });
    }
  }
  return false;
}
