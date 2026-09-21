/**
 * @jest-environment node
 *
 * The completeness formula used to exist as four pasted copies, and three
 * endpoints that write seeker fields never recomputed it at all. The stored
 * number drifted: 23 live seekers sat at a stored 0 while the profile page
 * computed 10–25 for the very same document, and the reminder email mailed them
 * that stale 0 ("Your profile is 0% complete", "00 actions completed").
 */
import {
  profileCompleteness,
  profileCompletenessScore,
  PROFILE_COMPLETENESS_FIELD_COUNT,
} from "@/lib/jobSeeker/profileCompleteness";

/** The formula as it was written inline, kept here as the reference oracle. */
function legacyFormula(doc: Record<string, unknown>): number {
  let c = 0;
  if (doc.userId) c += 10;
  if (doc.nationality) c += 10;
  if (doc.currentLocation) c += 5;
  if (doc.summary) c += 10;
  if (Array.isArray(doc.skills) && doc.skills.length) c += 20;
  if (Array.isArray(doc.experience) && doc.experience.length) c += 20;
  if (Array.isArray(doc.education) && doc.education.length) c += 15;
  if (Array.isArray(doc.languages) && doc.languages.length) c += 5;
  if (
    doc.linkedin ||
    (doc.socialLinks as Array<{ label?: string }> | undefined)?.some(
      (l) => l.label?.toLowerCase() === "linkedin",
    )
  ) {
    c += 5;
  }
  return Math.min(100, c);
}

const FIXTURES: Array<Record<string, unknown>> = [
  {},
  { userId: "u1" },
  { userId: "u1", education: [{ degree: "B.Tech" }] },
  { userId: "u1", nationality: "IN", currentLocation: "Kochi" },
  {
    userId: "u1",
    nationality: "IN",
    currentLocation: "Kochi",
    summary: "Engineer",
    skills: ["react"],
    experience: [{ jobTitle: "Dev" }],
    education: [{ degree: "B.Tech" }],
    languages: ["English"],
    socialLinks: [{ label: "LinkedIn", url: "x" }],
  },
  { userId: "u1", skills: [], experience: [], education: [], languages: [] },
  { userId: "u1", linkedin: "https://linkedin.com/in/x" },
  { userId: "u1", socialLinks: [{ label: "GitHub", url: "x" }] },
];

describe("profileCompleteness", () => {
  it("matches the formula it replaced, field for field", () => {
    for (const doc of FIXTURES) {
      expect(profileCompletenessScore(doc)).toBe(legacyFormula(doc));
    }
  });

  it("reproduces the live account the profile page renders as 25%", () => {
    // ilsslmmk@gmail.com: a userId and one education entry, nothing else — the
    // document whose stored value was 0 while the page showed 25.
    const score = profileCompletenessScore({
      userId: "69d49b71e9e5975c9c2781ac",
      education: [{ degree: "B.Com" }],
      skills: [],
      experience: [],
    });
    expect(score).toBe(25);
  });

  it("never returns 0 for a document that has a userId", () => {
    // A stored 0 is therefore always drift, never a real score — which is what
    // made the "Your profile is 0% complete" email impossible to be truthful.
    for (const doc of FIXTURES.filter((d) => d.userId)) {
      expect(profileCompletenessScore(doc)).toBeGreaterThan(0);
    }
  });

  it("a fully filled profile reaches exactly 100", () => {
    const full = FIXTURES[4];
    expect(profileCompletenessScore(full)).toBe(100);
    expect(profileCompleteness(full).missing).toHaveLength(0);
  });

  it("splits every field into done or missing, with nothing lost", () => {
    const result = profileCompleteness({ userId: "u1", skills: ["react"] });
    expect(result.total).toBe(PROFILE_COMPLETENESS_FIELD_COUNT);
    expect(result.done.length + result.missing.length).toBe(result.total);
    expect(result.done.map((i) => i.key).sort()).toEqual(["skills", "userId"]);
  });

  it("orders missing fields heaviest first, so the email asks for what matters", () => {
    const { missing } = profileCompleteness({ userId: "u1" });
    // skills and experience tie at 20; either may lead, but a 5-pointer never can.
    expect(missing[0].weight).toBe(20);
    expect(["skills", "experience"]).toContain(missing[0].key);
    const weights = missing.map((i) => i.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("the weights add up to exactly 100", () => {
    const { items } = profileCompleteness({});
    expect(items.reduce((sum, i) => sum + i.weight, 0)).toBe(100);
  });

  it("counts a not-yet-saved CV extraction via the fallback", () => {
    // The CV extractor scores what it is about to write, mapping its parsed
    // `headline` onto `summary`.
    const doc = { userId: "u1" };
    const extracted = { headline: "Senior Welder", skills: ["welding"] };
    expect(profileCompletenessScore(doc, extracted)).toBe(40); // 10 + 10 + 20
  });

  it("treats a null document as an empty one rather than throwing", () => {
    expect(profileCompletenessScore(null)).toBe(0);
    expect(profileCompletenessScore(undefined)).toBe(0);
  });
});
