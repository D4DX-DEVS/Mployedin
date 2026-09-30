/**
 * @jest-environment node
 *
 * "Job preference updates shows couldn't save" (client sheet, 2026-09-30).
 * The Preferences page sends the whole form back to PATCH /api/job-seeker/profile.
 * Stored profiles made that payload invalid in two ways, so the save 400'd
 * even when the seeker changed nothing about salary:
 *  - the model's `preferredSalary.currency` default stores `{ currency: "USD" }`
 *    with no min/max (84 of 259 live profiles);
 *  - the 2026-06-02 bulk import stored experience lines joined with ";" as one
 *    "role" longer than the validator's 100 characters (35 profiles).
 */
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import { preferencesFromProfile, MAX_PREFERRED_ROLE_LENGTH } from "@/lib/jobSeeker/preferences";

describe("preferencesFromProfile", () => {
  it("fills salary min/max when the profile only stored the currency default", () => {
    const prefs = preferencesFromProfile({ preferredSalary: { currency: "AED" } });
    expect(prefs.preferredSalary).toEqual({ min: 0, max: 0, currency: "AED" });
  });

  it("uses safe defaults for an empty profile", () => {
    expect(preferencesFromProfile({})).toEqual({
      preferredRoles: [],
      preferredCountries: [],
      preferredSalary: { min: 0, max: 0, currency: "USD" },
      preferredJobType: "any",
      availabilityStatus: "immediately",
      noticePeriod: 0,
    });
  });

  it("splits an imported ';'-joined role line into separate roles within the limit", () => {
    const joined =
      "Managing Director – Madarsa Jamia Islamia; Teacher – Kosi Public School; Expansion Secretary – Some Very Long Organisation Name Here";
    const prefs = preferencesFromProfile({ preferredRoles: [joined, "Teacher – Kosi Public School"] });
    expect(prefs.preferredRoles).toEqual([
      "Managing Director – Madarsa Jamia Islamia",
      "Teacher – Kosi Public School",
      "Expansion Secretary – Some Very Long Organisation Name Here",
    ]);
    for (const role of prefs.preferredRoles) expect(role.length).toBeLessThanOrEqual(MAX_PREFERRED_ROLE_LENGTH);
  });

  it("strips bullets and clips a single over-long role instead of dropping it", () => {
    const long = `• Production Engineer - ${"x".repeat(150)}`;
    const [role] = preferencesFromProfile({ preferredRoles: [long] }).preferredRoles;
    expect(role.startsWith("Production Engineer")).toBe(true);
    expect(role.length).toBe(MAX_PREFERRED_ROLE_LENGTH);
  });

  it("keeps at most 20 roles", () => {
    const roles = Array.from({ length: 25 }, (_, i) => `Role ${i}`);
    expect(preferencesFromProfile({ preferredRoles: roles }).preferredRoles).toHaveLength(20);
  });
});

describe("saving preferences built from stored profiles", () => {
  const stored = [
    { preferredSalary: { currency: "USD" } },
    { preferredSalary: { currency: "INR", min: 30000 } },
    { preferredRoles: [`Salesman (D.S Group); Marketing Salesman (I-Mobile Accessories); ${"y".repeat(120)}`] },
    { preferredSalary: { min: 1000, max: 3000, currency: "AED" }, noticePeriod: 30 },
  ];

  it.each(stored)("an unchanged save validates (%#)", (profile) => {
    const body = JSON.parse(JSON.stringify(preferencesFromProfile(profile)));
    expect(jobSeekerProfileUpdateSchema.safeParse(body).success).toBe(true);
  });

  it("the validator accepts a salary with only a currency", () => {
    expect(jobSeekerProfileUpdateSchema.safeParse({ preferredSalary: { currency: "USD" } }).success).toBe(true);
  });

  it("the validator still rejects a negative salary", () => {
    expect(jobSeekerProfileUpdateSchema.safeParse({ preferredSalary: { min: -1, max: 0, currency: "USD" } }).success).toBe(false);
  });
});
