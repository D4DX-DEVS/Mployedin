import { test, expect } from "@playwright/test";

/**
 * End-to-end check of the match engine through the real stack (NextAuth session
 * → /api/jobs/recommended → matchScore).
 *
 * Fixtures come from `node --env-file=.env scripts/_tmp-seed-match-probe.mjs`,
 * which seeds one seeker and five "EPROBE " jobs. Each job isolates one scoring
 * behaviour, so a wrong number points at a specific component rather than "the
 * score changed". The seeker declares only React; Node.js and TypeScript exist
 * solely in the CV text.
 */

const EMAIL = process.env.E2E_PROBE_EMAIL ?? "match-probe@test.mployedin.com";
const PASS = process.env.E2E_PROBE_PASS ?? "TestPass123!";

const EXPECTED: Record<string, { score: number; why: string }> = {
  "EPROBE React Developer Core": {
    score: 93,
    why: "baseline — CV text supplies 2 of the 3 required skills (1 + 0.75 + 0.75)/3",
  },
  "EPROBE React Developer Kochi": {
    score: 88,
    why: "same job plus an unmet preferred skill — nice-to-haves cost only 15% of the skill weight",
  },
  "EPROBE React Developer Bangalore": {
    score: 80,
    why: "same again but onsite in another city — location drops to 0.6",
  },
  "EPROBE Cloud Support Engineer": {
    score: 59,
    why: "seeker's skills are only this job's nice-to-haves; none of its required skills are met",
  },
  "EPROBE Retail Store Cashier": {
    score: 54,
    why: "no skill overlap and an unrelated career, floored at half the seeker's total years",
  },
};

interface FeedJob {
  _id: string;
  title: string;
  matchScore: number;
  matchedSkills?: string[];
}

async function loginAsProbe(page: import("@playwright/test").Page) {
  await page.goto("/en/login");
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASS);
  await page.click("button[type=submit]");
  await page.waitForURL(/job-seeker|dashboard/, { timeout: 30_000 });
}

test.describe("match engine", () => {
  test("scores every probe job exactly as the components predict", async ({ page }) => {
    await loginAsProbe(page);

    // Walk the cursor-paginated feed until every probe job has been seen — they
    // are ranked among all live jobs, so their page position is not fixed.
    const seen: FeedJob[] = [];
    const order: string[] = [];
    let cursor: string | null = null;

    for (let i = 0; i < 15; i++) {
      const url = `/api/jobs/recommended?limit=20&sort=match${cursor ? `&cursor=${cursor}` : ""}`;
      const body = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: "include" });
        return { status: res.status, json: await res.json() };
      }, url);

      expect(body.status, "recommended feed should authenticate").toBe(200);
      const jobs = (body.json.jobs ?? []) as FeedJob[];
      for (const job of jobs) {
        order.push(job.title);
        if (job.title.startsWith("EPROBE ")) seen.push(job);
      }
      cursor = body.json.nextCursor ?? null;
      if (!cursor || seen.length === Object.keys(EXPECTED).length) break;
    }

    const found = new Map(seen.map((j) => [j.title, j]));
    expect(
      [...found.keys()].sort(),
      "all five probe jobs should appear in the feed",
    ).toEqual(Object.keys(EXPECTED).sort());

    // Exact score per job — each mismatch names the component that broke.
    for (const [title, { score, why }] of Object.entries(EXPECTED)) {
      expect(found.get(title)!.matchScore, `${title}: ${why}`).toBe(score);
    }

    // Ranking, not just arithmetic: better fit must sort earlier in the feed.
    const positions = Object.keys(EXPECTED).map((t) => ({ t, i: order.indexOf(t) }));
    const byFeedOrder = [...positions].sort((a, b) => a.i - b.i).map((p) => p.t);
    expect(byFeedOrder, "feed order should follow match quality").toEqual([
      "EPROBE React Developer Core",
      "EPROBE React Developer Kochi",
      "EPROBE React Developer Bangalore",
      "EPROBE Cloud Support Engineer",
      "EPROBE Retail Store Cashier",
    ]);
  });

  test("renders the probe jobs with their scores in the feed UI", async ({ page }) => {
    await loginAsProbe(page);
    // No networkidle here: the dashboard keeps a connection open for live
    // notifications, so that state never arrives and the wait just times out.
    await page.goto("/en/job-seeker/jobs");

    await expect(page.getByText("EPROBE React Developer Core").first()).toBeVisible({
      timeout: 30_000,
    });
    // The top-ranked probe job's percentage should be on screen somewhere.
    await expect(page.getByText(/93\s*%/).first()).toBeVisible({ timeout: 20_000 });
  });
});
