import type { Page, Locator } from "@playwright/test";
import fs from "fs";
import path from "path";

export const SHOTS = path.resolve(__dirname, "../qa-reports/screens/employer");
export const LOG = path.resolve(__dirname, "../qa-reports/screens/employer/_log.jsonl");
fs.mkdirSync(SHOTS, { recursive: true });

export function log(obj: Record<string, unknown>) {
  fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");
}

export type Issues = { console: string[]; pageerror: string[]; net: string[] };

export function watch(page: Page): Issues {
  const issues: Issues = { console: [], pageerror: [], net: [] };
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") issues.console.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => issues.pageerror.push(String(e.message).slice(0, 300)));
  page.on("response", (r) => {
    if (r.status() >= 400) issues.net.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`);
  });
  return issues;
}

export function flush(issues: Issues, label: string) {
  const snap = { console: [...issues.console], pageerror: [...issues.pageerror], net: [...issues.net] };
  issues.console.length = 0; issues.pageerror.length = 0; issues.net.length = 0;
  if (snap.console.length || snap.pageerror.length || snap.net.length) log({ label, ...snap });
  return snap;
}

export async function shot(page: Page, name: string, full = true) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: full }).catch((e) => log({ label: name, shotError: String(e) }));
  return p;
}

export async function login(page: Page, email: string, password: string, locale = "en") {
  for (let i = 0; i < 2; i++) {
    await page.goto(`/${locale}/login`, { waitUntil: "load" }).catch(async () => { await page.waitForTimeout(1500); await page.goto(`/${locale}/login`, { waitUntil: "load" }); });
    await page.waitForTimeout(800);
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click("button[type=submit]");
    try {
      await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
      return true;
    } catch {
      if (i === 1) return false;
    }
  }
  return false;
}

export async function pickSelect(scope: Locator, page: Page, optionText?: string | RegExp) {
  await scope.locator('[role="combobox"]').first().click();
  const opts = page.locator('[data-testid="searchable-select-content"] [role="option"], [role="listbox"] [role="option"]');
  await opts.first().waitFor({ timeout: 5000 });
  if (optionText) await opts.filter({ hasText: optionText }).first().click();
  else await opts.first().click();
}

export async function bodyText(page: Page) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 1500);
}

/** Heuristics for layout issues. */
export async function layoutProbe(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    const wide: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2 && wide.length < 5) {
        const h = el as HTMLElement;
        wide.push(`${h.tagName.toLowerCase()}.${String(h.className).slice(0, 60)} right=${Math.round(r.right)}`);
      }
    });
    const text = document.body.innerText;
    const rawKeys = (text.match(/\b[a-z]+[A-Z][a-zA-Z]*\.[a-zA-Z.]+\b|\b[a-z]+\.[a-z]+[A-Z][a-zA-Z]+\b/g) || []).slice(0, 10);
    const undefinedText = /\bundefined\b|\bNaN\b|\[object Object\]/.test(text);
    return { overflowX, wide, rawKeys, undefinedText, h1: document.querySelector("h1")?.textContent?.trim() ?? null };
  });
}
