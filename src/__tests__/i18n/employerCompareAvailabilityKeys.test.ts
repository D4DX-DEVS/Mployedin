import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

/**
 * Keys the compare dialog and the availability chips call. next-intl throws
 * on an unknown key at runtime, so a missing one takes the whole applications
 * workspace down.
 */
const REQUIRED = [
  "compare", "compareShort", "compareFinalists", "compareDescription", "compareError", "noCandidatesToCompare",
  "commonSkillsIndicator", "sharedSkill", "notScoredYet", "expectedSalary", "notProvided", "profileCompleteness",
  "breakdownSkills", "breakdownExperience", "breakdownLocation", "breakdownSalary",
  "aiMatch", "yearsOfExperience", "yearsAbbr", "skills",
  "freeSlotsFor", "noFreeSlots", "freeSlotsLabel",
];

type Ns = Record<string, Record<string, string>>;

describe("employerApplications compare + availability keys", () => {
  const enNs = (en as unknown as Ns).employerApplications;
  const arNs = (ar as unknown as Ns).employerApplications;

  it.each(REQUIRED)("has %s in en and ar", (key) => {
    expect(enNs?.[key]).toEqual(expect.any(String));
    expect(arNs?.[key]).toEqual(expect.any(String));
  });

  it("keeps the match band labels the score ring reads", () => {
    for (const key of ["strong", "moderate", "low"]) {
      expect((en as unknown as { employerCompliance: { match: Record<string, string> } }).employerCompliance.match[key]).toEqual(expect.any(String));
      expect((ar as unknown as { employerCompliance: { match: Record<string, string> } }).employerCompliance.match[key]).toEqual(expect.any(String));
    }
  });

  it("never starts an error message with 'Failed to'", () => {
    expect(enNs.compareError).not.toMatch(/^failed to/i);
  });
});
