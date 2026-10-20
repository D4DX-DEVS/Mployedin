import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

/**
 * CV builder: the downloaded PDF matches the live preview (2026-10-20).
 *
 * For every template, the builder opens with a seeker-arranged section order
 * and one hidden section, then the real PDF is downloaded and its text read
 * back. Preview and PDF must list the sections in the same order, two-column
 * templates keep each section in its own column, the hidden section is in
 * neither, and every entry of a multi-page CV is printed.
 *
 * Read-only: the CV comes from a rewritten GET /api/job-seeker/profile
 * response in the browser; nothing is saved to the profile.
 * The component-level twin is src/__tests__/components/cvSectionOrder.test.tsx.
 */

const JOB_SEEKER_EMAIL = process.env.E2E_JS_EMAIL ?? "jobseeker@mployedin.com";
const JOB_SEEKER_PASS = process.env.E2E_JS_PASS ?? "JobSeeker@1234";

type SectionKey = "experience" | "education" | "skills" | "projects" | "languages" | "certifications";

const TEMPLATE_IDS = [
  "classic", "modern", "minimal", "executive", "creative", "elegant",
  "professional", "compact", "timeline", "academic", "technical", "banner",
];
/* Mirrors TEMPLATE_COLUMNS in job-seeker/cv/types.ts. */
const COLUMNS: Record<string, { main: SectionKey[]; side: SectionKey[] }> = {
  modern: { side: ["skills", "languages", "certifications"], main: ["experience", "education", "projects"] },
  executive: { main: ["experience", "projects"], side: ["education", "skills", "languages", "certifications"] },
  professional: { main: ["experience", "projects"], side: ["skills", "education", "languages", "certifications"] },
};

const ORDER: SectionKey[] = ["skills", "certifications", "experience", "projects", "education", "languages"];
const HIDDEN: SectionKey = "languages";
const SHOWN = ORDER.filter((key) => key !== HIDDEN);
/* Enough entries to run every template onto a second page. */
const ENTRIES = 14;

const messages = JSON.parse(readFileSync(path.join(__dirname, "../messages/en.json"), "utf8"));
const templateName = (id: string): string => messages.cvBuilderPage.templatePicker.templates[id].name;

const marker = (key: SectionKey, i: number) => `Q${key.toUpperCase()}${i}Q`;
const range = Array.from({ length: ENTRIES }, (_, i) => i);

function sectionSequence(text: string): SectionKey[] {
  return ORDER
    .filter((key) => text.includes(marker(key, 0)))
    .sort((a, b) => text.indexOf(marker(a, 0)) - text.indexOf(marker(b, 0)));
}

function expectSeekerOrder(templateId: string, sequence: SectionKey[]) {
  const columns = COLUMNS[templateId];
  if (!columns) {
    expect(sequence).toEqual(SHOWN);
    return;
  }
  for (const members of [columns.main, columns.side]) {
    expect(sequence.filter((key) => members.includes(key))).toEqual(SHOWN.filter((key) => members.includes(key)));
  }
}

/** Serve the builder a marker CV with the given design instead of the account's own. */
async function serveMarkerProfile(page: Page, templateId: string) {
  await page.route("**/api/job-seeker/profile", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const profile = body.data ?? body;
    Object.assign(profile, {
      summary: "Operations lead",
      avatar: "",
      skills: range.map((i) => marker("skills", i)),
      experience: range.map((i) => ({
        jobTitle: marker("experience", i), company: "Acme Trading", country: "UAE",
        startDate: "2019-01-01", endDate: "2021-06-01", isCurrent: false,
        description: "Ran the regional warehouse team and cut picking time by a third.",
      })),
      education: range.map((i) => ({
        degree: marker("education", i), institution: "City University", field: "Logistics", graduationDate: "2018-06-01",
      })),
      projects: range.map((i) => ({ title: marker("projects", i), description: "Moved stock counts to handheld scanners.", techStack: ["SAP"] })),
      languages: range.map((i) => ({ language: marker("languages", i), proficiency: "native" })),
      certifications: range.map((i) => marker("certifications", i)),
      cvDesign: {
        templateId,
        formatting: {
          font: "inter", fontSize: "medium", spacing: "medium", themeColor: "blue", pageFormat: "a4",
          dateFormat: "short", lineHeight: "normal", margin: "normal", sectionOrder: ORDER,
        },
        hiddenSections: [HIDDEN],
      },
    });
    await route.fulfill({ response, json: body });
  });
}

async function openBuilder(context: BrowserContext, templateId: string): Promise<Page> {
  const page = await context.newPage();
  await serveMarkerProfile(page, templateId);
  await page.goto("/en/job-seeker/cv");
  await expect(page.locator("[data-cv-preview]")).toContainText(marker("experience", 0), { timeout: 120_000 });
  return page;
}

async function previewSequence(page: Page): Promise<SectionKey[]> {
  return sectionSequence(await page.locator("[data-cv-preview]").innerText());
}

async function downloadPdfText(page: Page): Promise<{ text: string; pages: number }> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.getByRole("button", { name: /^Download PDF$/ }).click(),
  ]);
  const file = await download.path();
  const parser = new PDFParse({ data: readFileSync(file) });
  try {
    const result = await parser.getText();
    return { text: result.text, pages: result.total };
  } finally {
    await parser.destroy();
  }
}

test.describe("CV builder PDF matches the preview", () => {
  test.describe.configure({ mode: "default" });
  test.skip(({ isMobile }) => isMobile, "The download flow is the same on every viewport; run it once.");
  test.setTimeout(240_000);

  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/en/login");
    await page.fill("input[type=email]", JOB_SEEKER_EMAIL);
    await page.fill("input[type=password]", JOB_SEEKER_PASS);
    await page.click("button[type=submit]");
    await page.waitForURL(/job-seeker/, { timeout: 120_000 });
    storageState = await context.storageState();
    await context.close();
  });

  for (const templateId of TEMPLATE_IDS) {
    test(`${templateId}: same order, same hidden section, every entry`, async ({ browser }) => {
      const context = await browser.newContext({ storageState, acceptDownloads: true });
      try {
        const page = await openBuilder(context, templateId);
        const preview = await previewSequence(page);
        expectSeekerOrder(templateId, preview);

        const pdf = await downloadPdfText(page);
        // PDF text reads page by page: in a two-column template the long main
        // column continues on page 2 after the side column has ended, so the
        // columns are compared one at a time (as on screen), not as one stream.
        expectSeekerOrder(templateId, sectionSequence(pdf.text));
        if (!COLUMNS[templateId]) expect(sectionSequence(pdf.text)).toEqual(preview);
        expect(pdf.text).not.toContain(marker(HIDDEN, 0));
        expect(pdf.pages).toBeGreaterThan(1);
        for (const key of SHOWN) {
          const positions = range.map((i) => pdf.text.indexOf(marker(key, i)));
          expect(positions.every((p) => p >= 0), `${key}: every entry printed`).toBe(true);
          expect([...positions].sort((a, b) => a - b), `${key}: entries in order`).toEqual(positions);
        }
      } finally {
        await context.close();
      }
    });
  }

  test("switching template keeps the content, the order and the hidden section", async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    try {
      const page = await openBuilder(context, "classic");
      await page.getByRole("tab", { name: /Templates/ }).click();
      for (const templateId of ["modern", "creative", "professional", "classic"]) {
        await page.getByRole("button", { name: `Use the ${templateName(templateId)} template` }).click();
        await expect(page.locator("[data-cv-preview]")).toContainText(marker("experience", ENTRIES - 1));
        const preview = await previewSequence(page);
        expect(preview).toHaveLength(SHOWN.length);
        expectSeekerOrder(templateId, preview);
      }
    } finally {
      await context.close();
    }
  });
});
