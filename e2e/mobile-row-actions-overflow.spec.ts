import { test, expect, type Page } from "@playwright/test";

/**
 * Regression cover for the mobile row-actions overflow (agent QA, 2026-09-16).
 *
 * Under 640px `ResponsiveTables` turns every semantic table into cards, and the
 * last cell — the one holding the row's buttons — becomes
 * `td[data-mobile-actions] > div`. globals.css makes that div a horizontal
 * scroller with `scrollbar-width: none`, which is deliberate: admin's
 * five-action employer rows used to wrap onto three lines and make a collapsed
 * card taller than the record it described.
 *
 * The cost was that a row overflowing by a few pixels looks identical to a
 * rendering bug. /en/agent/jobs measured clientWidth 280 / scrollWidth 290 at
 * 390px, so "View Job" rendered as "View Jo" with no scrollbar, no fade, and
 * nothing to suggest a swipe. QA filed it as clipped text.
 *
 * The invariant this file defends: a row with one or two actions must never
 * need scrolling. Those rows now wrap instead. Rows with three or more keep the
 * scroller — they are exempt here and carry a scroll shadow instead, which this
 * spec also asserts so the affordance cannot be silently dropped.
 *
 * 390x844 is set explicitly rather than inherited from the `mobile-chromium`
 * project (Pixel 7, 412px): the defect needed the narrower iPhone-class width,
 * and 412px would pass while the bug was still live.
 */

const VIEWPORT = { width: 390, height: 844 };

type Creds = { email: string; password: string };

const AGENT: Creds = {
  email: process.env.E2E_AGENT_EMAIL ?? "agent@mployedin.com",
  password: process.env.E2E_AGENT_PASS ?? "Agent@1234",
};
const ADMIN: Creds = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@mployedin.com",
  password: process.env.E2E_ADMIN_PASS ?? "Admin@1234",
};
const EMPLOYER: Creds = {
  email: process.env.E2E_EMPLOYER_EMAIL ?? "employer@test.mployedin.com",
  password: process.env.E2E_EMPLOYER_PASS ?? "TestPass123!",
};
const SUPER_AGENT: Creds = {
  email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com",
  password: process.env.E2E_SA_PASS ?? "SuperAgent@1234",
};
const JOB_SEEKER: Creds = {
  email: process.env.E2E_SEEKER_EMAIL ?? "jobseeker@mployedin.com",
  password: process.env.E2E_SEEKER_PASS ?? "JobSeeker@1234",
};

/**
 * Every role's list pages that render a semantic table with row actions.
 *
 * Job seeker is absent on purpose, not by oversight: that role is a job board
 * rather than a dashboard, and no route under (dashboard)/job-seeker renders a
 * <TableBody> at all. There are no card-table action rows there to defend.
 *
 * Employer uses invoices/placements/scorecards for the same reason —
 * /en/employer/jobs is the job workspace board, not a table.
 */
const ROLES: { name: string; creds: Creds; paths: string[] }[] = [
  { name: "agent", creds: AGENT, paths: ["/en/agent/jobs", "/en/agent/placements", "/en/agent/invoices"] },
  { name: "admin", creds: ADMIN, paths: ["/en/admin/employers", "/en/admin/jobs", "/en/admin/agents"] },
  {
    name: "employer",
    creds: EMPLOYER,
    paths: ["/en/employer/invoices", "/en/employer/placements", "/en/employer/scorecards"],
  },
  {
    name: "super-agent",
    creds: SUPER_AGENT,
    paths: ["/en/super-agent/agents", "/en/super-agent/employers", "/en/super-agent/leads"],
  },
];

async function login(page: Page, creds: Creds) {
  // networkidle, not domcontentloaded: filling before React hydrates leaves the
  // controlled inputs empty and the submit silently does nothing.
  await page.goto("/en/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
}

type ActionRow = {
  actions: number;
  clientWidth: number;
  scrollWidth: number;
  overflowPx: number;
  hasScrollShadow: boolean;
  labels: string;
};

/**
 * ResponsiveTables only enhances while the mobile media query matches, and it
 * defers its sweep to requestIdleCallback. Poll for the tagged cell rather than
 * sleeping a fixed amount — on a cold route the first paint can be seconds out.
 *
 * Collapsed cards hide every cell from the third onward
 * (`tr[data-mobile-collapsible] > td:nth-child(n+3) { display: none }`), and the
 * actions cell is always the last one. Measuring without expanding first reports
 * clientWidth 0 / scrollWidth 0 for those rows, which satisfies
 * `scrollWidth <= clientWidth` while proving nothing — an earlier run of this
 * spec "passed" employer that way. So every collapsible row is expanded first.
 *
 * The attribute is set directly rather than by clicking each row: it is exactly
 * what ResponsiveTables' own setExpanded() writes, and the CSS keys off the
 * attribute alone. The click path is covered separately by the disclosure tests.
 */
async function readActionRows(page: Page): Promise<ActionRow[]> {
  await page
    .locator("table.responsive-card-table td[data-mobile-actions]")
    .first()
    .waitFor({ state: "attached", timeout: 30_000 })
    .catch(() => undefined);

  await page.evaluate(() => {
    document
      .querySelectorAll("table.responsive-card-table > tbody > tr[data-mobile-collapsible]")
      .forEach((row) => row.setAttribute("data-mobile-expanded", ""));
  });
  // Let the expanded rows lay out before anything is measured.
  await page.waitForTimeout(250);

  return page.evaluate(() => {
    const cells = document.querySelectorAll<HTMLTableCellElement>(
      "table.responsive-card-table > tbody > tr > td[data-mobile-actions]"
    );

    return Array.from(cells).flatMap((cell) => {
      const row = cell.firstElementChild;
      if (!(row instanceof HTMLElement)) return [];

      const actions = row.querySelectorAll(":scope > a, :scope > button").length;
      if (actions === 0) return [];

      // The shadow is painted with background-image layers, so its presence is
      // observable without knowing the exact gradient syntax.
      const backgroundImage = getComputedStyle(row).backgroundImage;

      return [
        {
          actions,
          clientWidth: row.clientWidth,
          scrollWidth: row.scrollWidth,
          overflowPx: row.scrollWidth - row.clientWidth,
          hasScrollShadow: backgroundImage !== "none" && backgroundImage.includes("gradient"),
          labels: (row.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        },
      ];
    });
  });
}

test.describe("mobile row actions do not clip", () => {
  test.use({ viewport: VIEWPORT });
  // Each test logs in and then walks two or three list routes. Against a dev
  // server those are first-hit compilations, and even a prod build on a loaded
  // machine answers in seconds — the 30s default expires during navigation and
  // reports a timeout where the real answer is "still compiling".
  test.describe.configure({ timeout: 300_000 });

  for (const role of ROLES) {
    test(`${role.name}: one- and two-action rows never overflow at 390px`, async ({ page }) => {
      await login(page, role.creds);

      const offenders: string[] = [];
      const shadowless: string[] = [];
      let inspected = 0;

      for (const path of role.paths) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        const rows = await readActionRows(page);
        inspected += rows.length;

        for (const row of rows) {
          if (row.actions <= 2 && row.overflowPx > 0) {
            offenders.push(
              `${path} — ${row.actions} actions overflow ${row.overflowPx}px ` +
                `(${row.clientWidth} → ${row.scrollWidth}) "${row.labels}"`
            );
          }
          // A row that genuinely scrolls must say so. A three-action row that
          // happens to fit needs no shadow, hence the overflow condition.
          if (row.actions >= 3 && row.overflowPx > 0 && !row.hasScrollShadow) {
            shadowless.push(`${path} — ${row.actions} actions scroll with no shadow "${row.labels}"`);
          }
        }
      }

      // A role whose pages all rendered empty proves nothing; fail loudly rather
      // than reporting a green run against no data.
      expect(inspected, `no action rows found for ${role.name} — seed data missing?`).toBeGreaterThan(0);
      expect(offenders).toEqual([]);
      expect(shadowless).toEqual([]);
    });
  }
});
