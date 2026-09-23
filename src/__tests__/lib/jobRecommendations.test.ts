/**
 * @jest-environment node
 */
import { buildRecommendedJobQuery, countryPatterns } from "@/lib/jobRecommendations";

// Ranking and the recommend/don't verdict moved to the matching engine; their
// guarantees are pinned in seekerMatches.test.ts.

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
