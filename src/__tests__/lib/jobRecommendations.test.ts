/**
 * @jest-environment node
 */
import {
  buildRecommendedJobQuery,
  countryPatterns,
  isRelevantJob,
  rankRecommendedJobs,
  IRRELEVANT_SORT_PENALTY,
} from "@/lib/jobRecommendations";
import type { SeekerProfile } from "@/lib/matchScore";

const seekerProfile: SeekerProfile = {
  skills: ["React", "TypeScript"],
  location: "uae",
  locations: ["uae"],
  experienceYears: 3,
  salaryExpectation: 10000,
  salaryCurrency: "AED",
  preferredRoles: ["frontend developer"],
  educationLevel: 3,
  city: "dubai",
  cities: ["dubai"],
};

const reactJob = {
  _id: "job-react",
  title: "Frontend Developer",
  requirements: { skills: ["React", "TypeScript"], experienceMin: 2, experienceMax: 5 },
  salary: { min: 9000, max: 11000, currency: "AED" },
  location: { country: "UAE", city: "Dubai", isRemote: false },
  createdAt: new Date("2026-09-01"),
};

const salesJob = {
  _id: "job-sales",
  title: "Sales Support Staff",
  requirements: { skills: ["Cold Calling"], experienceMin: 2, experienceMax: 5 },
  salary: { min: 9000, max: 11000, currency: "AED" },
  location: { country: "UAE", city: "Dubai", isRemote: false },
  createdAt: new Date("2026-09-02"),
};

describe("buildRecommendedJobQuery", () => {
  const now = new Date("2026-09-09T00:00:00.000Z");

  it("only ever asks for live jobs", () => {
    const query = buildRecommendedJobQuery({ now });
    expect(query.status).toBe("active");
    expect(query.$and).toContainEqual({
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
    });
  });

  it("excludes the job ids it is handed", () => {
    const query = buildRecommendedJobQuery({ excludeJobIds: ["a", "b"], now });
    expect(query._id).toEqual({ $nin: ["a", "b"] });
  });

  it("omits the exclusion clause when there is nothing to exclude", () => {
    expect(buildRecommendedJobQuery({ excludeJobIds: [], now })._id).toBeUndefined();
  });

  it("filters to the preferred countries and keeps remote jobs visible", () => {
    const query = buildRecommendedJobQuery({ preferredCountries: ["India"], now });
    const clause = (query.$and as Array<Record<string, unknown>>).find((c) =>
      JSON.stringify(Object.keys(c)).includes("$or") && JSON.stringify(c).includes("location")
    ) as { $or: Array<Record<string, unknown>> };
    expect(clause.$or).toContainEqual({ "location.isRemote": true });
    const patterns = (clause.$or[0] as { "location.country": { $in: RegExp[] } })["location.country"].$in;
    expect(patterns.some((p) => p.test("india"))).toBe(true);
  });

  it("expands country aliases so UAE and United Arab Emirates both match", () => {
    const query = buildRecommendedJobQuery({ preferredCountries: ["UAE"], now });
    const clause = (query.$and as Array<Record<string, unknown>>).at(-1) as {
      $or: Array<{ "location.country"?: { $in: RegExp[] } }>;
    };
    const patterns = clause.$or[0]["location.country"]!.$in;
    expect(patterns.some((p) => p.test("United Arab Emirates"))).toBe(true);
    expect(patterns.some((p) => p.test("uae"))).toBe(true);
  });

  it("adds no country clause when the seeker stated no country", () => {
    const query = buildRecommendedJobQuery({ now });
    expect(JSON.stringify(query)).not.toContain("location.country");
  });
});

describe("isRelevantJob", () => {
  it("accepts a job that overlaps on skills", () => {
    expect(isRelevantJob(reactJob, seekerProfile)).toBe(true);
  });

  it("accepts a job that matches a preferred role title with no skill overlap", () => {
    expect(
      isRelevantJob({ ...salesJob, title: "Frontend Developer" }, seekerProfile)
    ).toBe(true);
  });

  it("rejects a job with neither skill overlap nor role match", () => {
    expect(isRelevantJob(salesJob, seekerProfile)).toBe(false);
  });

  it("stays relevant on a single signal — skills only, no preferred roles", () => {
    expect(isRelevantJob(reactJob, { ...seekerProfile, preferredRoles: [] })).toBe(true);
    expect(isRelevantJob(salesJob, { ...seekerProfile, preferredRoles: [] })).toBe(false);
  });

  it("accepts everything when the seeker has no skills and no roles", () => {
    expect(isRelevantJob(salesJob, { ...seekerProfile, skills: [], preferredRoles: [] })).toBe(true);
  });

  it("rejects a job demanding two qualification levels above the seeker", () => {
    const phdJob = { ...reactJob, requirements: { ...reactJob.requirements, education: "PhD" } };
    expect(isRelevantJob(phdJob, { ...seekerProfile, educationLevel: 3 })).toBe(false);
  });
});

describe("rankRecommendedJobs", () => {
  it("ranks a relevant job above an irrelevant one", () => {
    const ranked = rankRecommendedJobs([salesJob, reactJob], seekerProfile);
    expect(ranked.map((j) => j._id)).toEqual(["job-react", "job-sales"]);
  });

  it("keeps irrelevant jobs in the list and only penalizes their sort position", () => {
    const [, sales] = rankRecommendedJobs([reactJob, salesJob], seekerProfile);
    expect(sales._id).toBe("job-sales");
    expect(sales.sortScore).toBe(Math.max(0, sales.matchScore - IRRELEVANT_SORT_PENALTY));
    expect(sales.sortScore).toBeLessThan(sales.matchScore);
  });

  it("leaves the displayed match score of a relevant job unpenalized", () => {
    const [react] = rankRecommendedJobs([reactJob], seekerProfile);
    expect(react.sortScore).toBe(react.matchScore);
    expect(react.matchScore).toBeGreaterThan(80);
  });

  it("reports matched skills using the job's own wording", () => {
    const [ranked] = rankRecommendedJobs(
      [{ ...reactJob, requirements: { skills: ["React.js", "GraphQL"] } }],
      seekerProfile
    );
    expect(ranked.matchedSkills).toEqual(["React.js"]);
  });

  it("never returns a negative sort score", () => {
    const ranked = rankRecommendedJobs([salesJob], { ...seekerProfile, skills: ["React"], salaryExpectation: 0 });
    expect(ranked[0].sortScore).toBeGreaterThanOrEqual(0);
  });
});

describe("countryPatterns — real preference data is messy", () => {
  const matches = (prefs: string[], jobCountry: string) =>
    countryPatterns(prefs).some((p) => p.test(jobCountry));

  it("ignores stray whitespace on the preference", () => {
    expect(matches(["Oman "], "Oman")).toBe(true);
    expect(matches(["  Saudi Arabia"], "Saudi Arabia")).toBe(true);
  });

  it("strips a parenthetical suffix from the preference", () => {
    expect(matches(["Oman (Muscat)"], "Oman")).toBe(true);
    expect(matches(["Oman (based in Muscat)"], "Oman")).toBe(true);
    expect(matches(["Saudi Arabia (Transferable Iqama)"], "Saudi Arabia")).toBe(true);
  });

  it("tolerates a parenthetical suffix on the job side too", () => {
    expect(matches(["Oman"], "Oman (Muscat)")).toBe(true);
    expect(matches(["Oman"], "Oman ")).toBe(true);
  });

  it("expands through the region-code table, including the bare code", () => {
    expect(matches(["India"], "IN")).toBe(true);
    expect(matches(["Saudi Arabia (Transferable Iqama)"], "KSA")).toBe(true);
    expect(matches(["KSA"], "Saudi Arabia")).toBe(true);
    expect(matches(["United Kingdom"], "UK")).toBe(true);
    expect(matches(["Oman"], "OM")).toBe(true);
  });

  it("stays anchored — a country never matches a different one", () => {
    expect(matches(["Oman"], "Romania")).toBe(false);
    expect(matches(["India"], "Indiana Plains")).toBe(false);
    expect(matches(["UAE"], "Oman")).toBe(false);
  });

  it("drops a 'Remote / Global' preference instead of turning it into a country", () => {
    expect(countryPatterns(["Remote / Global"])).toEqual([]);
    expect(buildRecommendedJobQuery({ preferredCountries: ["Remote / Global"] }).$and).toHaveLength(1);
  });

  it("still narrows the query when a real country sits beside a remote preference", () => {
    const query = buildRecommendedJobQuery({ preferredCountries: ["Remote / Global", "Oman (Muscat)"] });
    expect(query.$and).toHaveLength(2);
  });
});
