/**
 * @jest-environment node
 *
 * One matching engine, every surface — kept that way.
 *
 * The app, the employer view and auto-apply used to score with an older
 * function (other weights, lexical skills, no gates) while the emails used the
 * engine, so one pair read 92% in an email and 67% on the home page. These
 * guards fail the moment a surface drifts back.
 */
import fs from "node:fs";
import path from "node:path";
import type { LimitingFactor } from "@/lib/matching/recommend";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Code only: a comment that names the old scorer (to explain why it is gone) is not a use. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("the pre-engine scorer stays out of production code", () => {
  it("is imported by nothing but its own module", () => {
    const offenders = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => !file.endsWith(path.join("lib", "matchScore.ts")))
      .filter((file) => /\bcalculateMatch(Score|Detail)\b/.test(stripComments(fs.readFileSync(file, "utf8"))))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe("every surface that shows a match percentage uses the engine", () => {
  const surfaces: Array<[string, RegExp]> = [
    ["src/app/api/jobs/recommended/handlers.ts", /scoreSeekerPool\(/],
    ["src/app/api/job-seeker/recommended-jobs/route.ts", /scoreSeekerPool\(/],
    ["src/app/[locale]/(dashboard)/job-seeker/page.tsx", /scoreSeekerPool\(/],
    ["src/lib/ai/copilot/tools/jobSeeker.ts", /scoreSeekerPool\(/],
    // The employer side scores through computeApplicantMatch, which runs the
    // engine pair score and only adds the checklist and saved weights on top.
    ["src/app/api/ai/match/route.ts", /computeApplicantMatch\(/],
    ["src/lib/inngest/aiScreenApplication.ts", /computeApplicantMatch\(/],
    ["src/lib/matching/scoreApplication.ts", /scoreOnePair\(/],
    ["src/app/api/ai/screen-candidates/route.ts", /scoreApplicationsOfJob\(/],
    ["src/lib/inngest/autoApply.ts", /recommendJobsFor\(/],
    ["src/lib/inngest/dailyRecommendations.ts", /recommendJobsFor\(/],
    ["src/lib/inngest/reEngagement.ts", /recommendJobsFor\(/],
    ["src/lib/inngest/similarJobsEmail.ts", /recommendJobsFor\(/],
  ];

  it.each(surfaces)("%s", (file, entryPoint) => {
    expect(read(file)).toMatch(entryPoint);
  });

  it.each(surfaces.filter(([file]) => file.includes("inngest")))(
    "%s remembers Jev verdicts, so the app reads the verdict the email paid for",
    (file) => {
      const src = read(file);
      // Passes the Mongo store itself, takes it from the shared options, or
      // scores through a seekerMatches helper that resolves those options.
      expect(/mongoJevVerdictStore|resolveEngineOptions|scoreOnePair\(|scoreSeekerPool\(|computeApplicantMatch\(/.test(src)).toBe(true);
    },
  );
});

describe("the jobs feed has no threshold of its own", () => {
  const feed = read("src/components/features/job-seeker/feed/JobFeedPage.tsx");

  it("splits recommended from the rest on the engine's flag", () => {
    expect(feed).toMatch(/\.filter\(\(j\) => j\.recommended\)/);
    expect(feed).not.toMatch(/HIGH_MATCH_THRESHOLD/);
  });
});

describe("an empty recommendation list can always say why", () => {
  // A Record over the union: adding a LimitingFactor without listing it here
  // is a type error, so the locale check below cannot silently fall behind.
  const ALL_FACTORS: Record<LimitingFactor, true> = {
    no_location: true,
    no_skills: true,
    no_roles: true,
    score: true,
    country: true,
    work_mode: true,
    salary: true,
    experience: true,
    education: true,
    experience_unknown: true,
    education_unknown: true,
  };

  it.each(["en", "ar"])("%s has copy for every limiting factor", (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    const blockers = messages.jobSeekerHome.recommendedJobs.blockers as Record<string, string>;
    for (const factor of Object.keys(ALL_FACTORS)) {
      expect(typeof blockers[factor]).toBe("string");
      expect(blockers[factor].length).toBeGreaterThan(0);
    }
  });
});

describe("the home page loads every field the engine reads", () => {
  it("selects every SEEKER_MATCH_FIELDS path, or its parent", () => {
    const page = read("src/app/[locale]/(dashboard)/job-seeker/page.tsx");
    const call = page.match(/JobSeeker\.findOne\(\{ userId \}\)\s*\.select\(([\s\S]*?)\)\s*\.lean\(\)/);
    expect(call).not.toBeNull();
    const selected = new Set(
      [...call![1].matchAll(/"([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean),
    );
    const missing = SEEKER_MATCH_FIELDS.split(/\s+/)
      .filter(Boolean)
      .filter((field) => !selected.has(field) && !selected.has(field.split(".")[0]));
    // A missing field changes the score silently: without totalExperienceYears
    // the page reads "experience unknown" where the email reads a number.
    expect(missing).toEqual([]);
  });
});
