/**
 * @jest-environment node
 *
 * No place, no recommendations.
 *
 * A seeker who picked no preferred country had no country filter at all, so the
 * job-match email could send them jobs from anywhere on the board. LinkedIn
 * (country is a required profile field) and Naukri (current and preferred
 * location asked at sign-up) never recommend without a place. We now:
 *
 *   1. use the preferred countries;
 *   2. otherwise, the country the seeker's current location names;
 *   3. otherwise recommend nothing anywhere, and ask for the country instead.
 */
import { countryKeyFromLocationText } from "@/lib/i18n/locations";
import { seekerProfileFromDoc, type SeekerProfile } from "@/lib/matchScore";
import { hasKnownLocation, recommendJobsFor, toCandidateJob } from "@/lib/matching/recommend";
import { buildDigestEmail } from "@/lib/inngest/dailyDigestWorker";

const mockDecide = jest.fn();
jest.mock("@/lib/ai/jev", () => ({
  ...jest.requireActual("@/lib/ai/jev"),
  hasJev: () => true,
  decide: (...args: unknown[]) => mockDecide(...args),
}));

beforeEach(() => {
  mockDecide.mockReset();
  mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0.9 } } });
});

describe("countryKeyFromLocationText", () => {
  it.each([
    ["Dubai, UAE", "ae"],
    ["Jeddah, Saudi Arabia (Transferable Iqama)", "sa"],
    ["N/A, Oman (Alkhuwair, Muscat)", "om"],
    ["Kochi, Kerala, India..", "in"],
    ["Saudi Arabia", "sa"],
  ])("reads the country off %p", (text, key) => {
    expect(countryKeyFromLocationText(text)).toBe(key);
  });

  it.each([["Kochi"], ["Palakkad, Kerala"], ["UAE / Oman"], [""], [null]])(
    "returns null rather than guess for %p",
    (text) => {
      expect(countryKeyFromLocationText(text)).toBeNull();
    },
  );
});

describe("seekerProfileFromDoc: where the seeker wants to work", () => {
  it("uses the preferred countries when there are any, ignoring the current location", () => {
    const p = seekerProfileFromDoc({ preferredCountries: ["Qatar"], currentLocation: "Kochi, India" });
    expect(p.locations).toEqual(["qatar"]);
    expect(p.locationSource).toBe("preferred");
  });

  it("falls back to the country of the current location", () => {
    const p = seekerProfileFromDoc({ currentLocation: "Kochi, Kerala, India" });
    expect(p.locations).toEqual(["in"]);
    expect(p.locationSource).toBe("current");
  });

  it("knows it has no location when neither says a country", () => {
    const p = seekerProfileFromDoc({ currentLocation: "Palakkad, Kerala" });
    expect(p.locations).toEqual([]);
    expect(p.locationSource).toBe("none");
    expect(hasKnownLocation(p)).toBe(false);
  });
});

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: ["React", "Node.js"],
    location: "",
    locations: [],
    experienceYears: 3,
    experienceKnown: true,
    salaryExpectation: 0,
    salaryCurrency: "",
    jobType: "any",
    preferredRoles: ["react developer"],
    educationLevel: 0,
    city: "",
    cities: [],
    cvText: "",
    roleHistory: [],
    ...overrides,
  };
}

const job = (id: string, country: string) =>
  toCandidateJob({
    _id: id,
    title: "React Developer",
    location: { country, isRemote: false },
    requirements: { skills: ["React", "Node.js"], experienceMin: 0, experienceMax: 10 },
    employerId: { companyName: "Acme" },
  });

describe("recommendJobsFor", () => {
  it("recommends nothing without a known country, and says so, before paying for Jev", async () => {
    const r = await recommendJobsFor(seeker({ locationSource: "none" }), [job("in", "India"), job("om", "Oman")], {
      threshold: 80,
      useAi: true,
    });
    expect(r.jobs).toEqual([]);
    expect(r.limitingFactor).toBe("no_location");
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it("keeps a seeker to the country their current location names", async () => {
    // The strong match in Oman used to reach a seeker in India who never set a preference.
    const profile = seekerProfileFromDoc({
      skills: ["React", "Node.js"],
      preferredRoles: ["React Developer"],
      totalExperienceYears: 3,
      currentLocation: "Kochi, India",
    });
    const r = await recommendJobsFor(profile, [job("in", "India"), job("om", "Oman")], { threshold: 80, useAi: false });
    expect(r.jobs.map((j) => j.id)).toEqual(["in"]);
    expect(r.rejected.country).toBe(1);
  });
});

describe("the email for a seeker with no known country", () => {
  const data = (locale: "en" | "ar") => ({
    userName: "Test",
    locale,
    jobs: [],
    profileViews: { count: 0, viewers: [] },
    nearMiss: { bestScore: 0, threshold: 80, considered: 0, topBlocker: "no_location" },
  });

  it("asks where they want to work and links to preferences, with no score to quote", () => {
    const html = buildDigestEmail(data("en"));
    expect(html).toContain("Where do you want to work?");
    expect(html).toContain("/en/job-seeker/preferences");
    expect(html).toContain("Add a preferred country");
    expect(html).not.toContain("No strong matches yet");
    expect(html).not.toMatch(/We checked|We found no openings/);
  });

  it("says the same in Arabic", () => {
    const html = buildDigestEmail(data("ar"));
    expect(html).toContain("أين ترغب في العمل؟");
    expect(html).toContain("/ar/job-seeker/preferences");
  });
});
