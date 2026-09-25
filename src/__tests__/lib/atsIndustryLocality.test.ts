/**
 * Employer ATS signals the seeker engine does not score: which industry a
 * candidate's career was spent in, and how near they live to the job.
 */
import {
  detectIndustries,
  industryEvidenceOf,
  industryFit,
  jobIndustriesOf,
} from "@/lib/matching/industry";
import { canonicalCity, localityLevel, parsePlace } from "@/lib/matching/locality";

describe("industry detection", () => {
  it("reads a food/FMCG employer from the job description and tags", () => {
    expect(
      jobIndustriesOf({
        description: "An established food products company (snacks, bakery and ready-to-cook) in Ernakulam.",
        tags: ["Sales", "Marketing"],
        skills: ["Sales Strategy"],
      }),
    ).toEqual(["food_fmcg"]);
    expect(jobIndustriesOf({ description: "", tags: ["FMCG"], skills: [] })).toEqual(["food_fmcg"]);
  });

  it("takes the employer's stated industry too", () => {
    expect(jobIndustriesOf({ description: "", tags: [], skills: [], employerIndustry: "Hospitality" })).toEqual(["hospitality"]);
  });

  it("does not read an industry out of benefits or skill jargon", () => {
    // "health insurance", "social media marketing", "university" are not industries.
    expect(detectIndustries("Health insurance and annual leave")).toEqual([]);
    expect(detectIndustries("Social Media Marketing, Google Ads")).toEqual([]);
    expect(detectIndustries("MBA, Bangalore University")).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(detectIndustries("seafood exporter")).toEqual([]);
    expect(detectIndustries("Albustan For Food and Beverage Mfg.")).toEqual(expect.arrayContaining(["food_fmcg", "manufacturing"]));
  });
});

describe("industry fit", () => {
  const evidence = (roles: Array<[string, number]>, profileText = "") => ({
    roles: roles.map(([text, years]) => ({ text, years })),
    profileText,
  });

  it("is full marks for three or more years in the job's industry", () => {
    const fit = industryFit(["food_fmcg"], evidence([["Sales Head - FMCG Division, KBFC Product House", 3.7], ["Area Sales Manager - FMCG", 3]]));
    expect(fit).toMatchObject({ score: 100, matched: ["food_fmcg"], source: "roles" });
    expect(fit!.years).toBeCloseTo(6.7, 1);
  });

  it("gives partial credit for a shorter stint, less for a mention, least for none", () => {
    expect(industryFit(["food_fmcg"], evidence([["OD Consultant, Albustan Food and Beverage", 1.1]]))?.score).toBe(75);
    expect(industryFit(["food_fmcg"], evidence([["AGM Sales, Sowparnika", 3]], "FMCG product IRIS cakes brand"))?.score).toBe(50);
    expect(industryFit(["food_fmcg"], evidence([["Manager, Client Acquisition, IndiaMART", 6]]))).toMatchObject({ score: 20, source: "none" });
  });

  it("does not score a job with no detectable industry", () => {
    expect(industryFit([], evidence([["Sales Head - FMCG", 5]]))).toBeNull();
  });

  it("builds evidence from a seeker document: dated roles plus profile text", () => {
    const now = new Date("2026-09-24T00:00:00.000Z");
    const ev = industryEvidenceOf(
      {
        industry: "FMCG",
        skills: ["Sales"],
        cv: { rawText: "Worked on bakery brands" },
        experience: [
          { jobTitle: "Area Sales Manager", company: "Pioneer Traders", description: "FMCG distribution", startDate: "2010-01-01", endDate: "2013-01-01" },
          { jobTitle: "Sales Head", company: "KBFC", isCurrent: true, startDate: "2023-01-01" },
        ],
      },
      now,
    );
    expect(ev.roles[0].text).toContain("FMCG distribution");
    expect(ev.roles[0].years).toBeCloseTo(3, 0);
    expect(ev.roles[1].years).toBeCloseTo(3.7, 1);
    expect(ev.profileText).toContain("bakery");
    expect(ev.profileText).toContain("FMCG");
  });
});

describe("locality", () => {
  it("treats a city's old and new names as the same city", () => {
    expect(canonicalCity("Kochi")).toBe(canonicalCity("Ernakulam"));
    expect(canonicalCity("Cochin")).toBe(canonicalCity("Ernakulam"));
    expect(canonicalCity("Calicut")).toBe(canonicalCity("Kozhikode"));
    expect(canonicalCity("Gurgaon")).toBe(canonicalCity("Gurugram"));
    expect(canonicalCity("Dubai")).toBe("dubai");
  });

  it("splits a free-text location into city, the rest, and a country", () => {
    expect(parsePlace("Kochi, Kerala, India")).toEqual({ city: canonicalCity("kochi"), parts: ["kochi", "kerala", "india"], country: "in" });
    expect(parsePlace("Manama, Bahrain")).toMatchObject({ country: "bh" });
    expect(parsePlace("")).toBeNull();
  });

  const jobPlace = { city: canonicalCity("Ernakulam"), state: "kerala", country: "in" };

  it("ranks the same city, then the same state, then the same country", () => {
    expect(localityLevel(jobPlace, [{ city: canonicalCity("Kochi"), state: "kerala", country: "in" }])).toBe("same_city");
    expect(localityLevel(jobPlace, [{ city: "cherthala", state: "kerala", country: "in" }])).toBe("same_state");
    expect(localityLevel(jobPlace, [{ city: canonicalCity("Gurugram"), state: "haryana", country: "in" }])).toBe("same_country");
    expect(localityLevel(jobPlace, [{ city: "manama", state: null, country: "bh" }])).toBe("abroad");
    expect(localityLevel(jobPlace, [])).toBe("unknown");
  });

  it("uses the best of where they live and where they would work", () => {
    expect(
      localityLevel(jobPlace, [
        { city: "manama", state: null, country: "bh" },
        { city: canonicalCity("Kochi"), state: null, country: "in" },
      ]),
    ).toBe("same_city");
  });
});
