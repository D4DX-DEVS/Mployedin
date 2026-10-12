import { buildJobLocationClauses, clampSearchText, companyNameRegex } from "@/lib/jobs/publicSearch";

type Clause = { $or?: Array<Record<string, RegExp>>; "location.isRemote"?: boolean };

/** Does a stored job location satisfy every clause, the way Mongo would read them? */
function matches(clauses: Clause[], job: { city?: string; country?: string; isRemote?: boolean }): boolean {
  return clauses.every((clause) => {
    if (clause["location.isRemote"] !== undefined) return job.isRemote === clause["location.isRemote"];
    return (clause.$or ?? []).some((option) => {
      const [field, pattern] = Object.entries(option)[0];
      const value = field === "location.city" ? job.city : job.country;
      return pattern.test(value ?? "");
    });
  });
}

describe("buildJobLocationClauses", () => {
  it("matches a country typed as an abbreviation against the stored full name", () => {
    expect(matches(buildJobLocationClauses("UAE"), { city: "Dubai", country: "United Arab Emirates" })).toBe(true);
  });

  it("matches a country typed as a name against a stored country code", () => {
    expect(matches(buildJobLocationClauses("India"), { city: "Mumbai", country: "IN" })).toBe(true);
  });

  it("requires every comma-separated part to match", () => {
    const clauses = buildJobLocationClauses("Dubai, UAE");
    expect(matches(clauses, { city: "Dubai", country: "United Arab Emirates" })).toBe(true);
    expect(matches(clauses, { city: "Sharjah", country: "United Arab Emirates" })).toBe(false);
  });

  it("matches cities by partial text", () => {
    expect(matches(buildJobLocationClauses("koch"), { city: "Kochi", country: "India" })).toBe(true);
  });

  it("treats Remote as remote jobs", () => {
    expect(buildJobLocationClauses("remote")).toEqual([{ "location.isRemote": true }]);
  });

  it("escapes regex characters instead of throwing", () => {
    expect(() => buildJobLocationClauses("Doha (QA")).not.toThrow();
    expect(matches(buildJobLocationClauses("a.b"), { city: "axb" })).toBe(false);
  });

  it("returns no clauses for blank input", () => {
    expect(buildJobLocationClauses("  ,  ")).toEqual([]);
  });
});

describe("companyNameRegex", () => {
  it("matches case-insensitively and escapes special characters", () => {
    expect(companyNameRegex("acme").test("ACME Trading")).toBe(true);
    expect(() => companyNameRegex("C++ (Labs")).not.toThrow();
  });
});

describe("clampSearchText", () => {
  it("trims and caps length", () => {
    expect(clampSearchText(`  ${"x".repeat(150)}  `)).toHaveLength(100);
  });
});
