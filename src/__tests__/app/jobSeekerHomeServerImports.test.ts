/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Guard: the seeker home page is a Server Component. Anything it imports from
 * a "use client" module arrives as a client-reference proxy, not a value —
 * `HOME_RECOMMENDED_JOB_COUNT` imported that way made `.slice(0, proxy)`
 * return [] and the server rendered zero recommendations for everyone.
 */
const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("job-seeker home page server imports", () => {
  const page = read("src/app/[locale]/(dashboard)/job-seeker/page.tsx");
  const client = read("src/components/features/job-seeker/home/JobSeekerHomePage.tsx");

  it("imports only the component from the client module", () => {
    const clientImport = page.match(
      /import\s*\{([^}]*)\}\s*from\s*"@\/components\/features\/job-seeker\/home\/JobSeekerHomePage"/,
    );
    expect(clientImport).not.toBeNull();
    const names = clientImport![1].split(",").map((n) => n.trim()).filter(Boolean);
    expect(names).toEqual(["JobSeekerHomePage"]);
  });

  it("takes the card count from the server-safe recommendations module", () => {
    expect(page).toMatch(/HOME_RECOMMENDED_JOB_COUNT[\s\S]*?from "@\/lib\/jobRecommendations"/);
    expect(client).toMatch(/import \{ HOME_RECOMMENDED_JOB_COUNT \} from "@\/lib\/jobRecommendations"/);
    expect(client).not.toMatch(/export const HOME_RECOMMENDED_JOB_COUNT/);
  });
});
