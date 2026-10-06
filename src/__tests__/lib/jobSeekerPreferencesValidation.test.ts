/**
 * @jest-environment node
 *
 * QA retest 2026-10-06 (BUG-02, BUG-03). A notice period of -5 or 999, or a
 * role longer than 100 characters, was rejected by the server with a precise
 * reason, but the page only said "We couldn't save." A minimum salary above
 * the maximum (90,000 vs 70,000) was saved as "Saved".
 */
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import {
  validatePreferences,
  preferenceErrorsFromServer,
  type PreferencesData,
} from "@/lib/jobSeeker/preferences";

const base: PreferencesData = {
  preferredRoles: ["React Developer"],
  preferredCountries: ["UAE"],
  preferredSalary: { min: 30000, max: 70000, currency: "INR" },
  preferredJobType: "any",
  availabilityStatus: "immediately",
  noticePeriod: 10,
};

describe("validatePreferences", () => {
  it("accepts a valid form", () => {
    expect(validatePreferences(base)).toEqual({});
  });

  it.each([-5, 999, 2.5])("names the notice period when it is %p", (noticePeriod) => {
    expect(validatePreferences({ ...base, noticePeriod })).toEqual({ noticePeriod: { code: "noticeRange" } });
  });

  it("accepts 0 and 365 days", () => {
    expect(validatePreferences({ ...base, noticePeriod: 0 })).toEqual({});
    expect(validatePreferences({ ...base, noticePeriod: 365 })).toEqual({});
  });

  it("names the role that is too long", () => {
    const long = "Senior Frontend Engineer ".repeat(5);
    expect(validatePreferences({ ...base, preferredRoles: ["Designer", long] })).toEqual({
      preferredRoles: { code: "roleTooLong", value: long.trim() },
    });
  });

  it("flags a minimum salary above the maximum", () => {
    const prefs = { ...base, preferredSalary: { min: 90000, max: 70000, currency: "INR" } };
    expect(validatePreferences(prefs)).toEqual({ preferredSalary: { code: "salaryOrder" } });
  });

  it("allows an open-ended range (max 0 means no upper limit)", () => {
    expect(validatePreferences({ ...base, preferredSalary: { min: 150000, max: 0, currency: "INR" } })).toEqual({});
  });

  it("flags a negative salary", () => {
    const prefs = { ...base, preferredSalary: { min: -1, max: 70000, currency: "INR" } };
    expect(validatePreferences(prefs)).toEqual({ preferredSalary: { code: "salaryNegative" } });
  });
});

describe("preferenceErrorsFromServer", () => {
  it("maps the server's field paths onto the form's fields", () => {
    const details = [
      { path: "noticePeriod", message: "Too small: expected number to be >=0" },
      { path: "preferredRoles.3", message: "Too big: expected string to have <=100 characters" },
    ];
    const prefs = { ...base, noticePeriod: -5, preferredRoles: ["a", "b", "c", "x".repeat(120)] };
    expect(preferenceErrorsFromServer(details, prefs)).toEqual({
      noticePeriod: { code: "noticeRange" },
      preferredRoles: { code: "roleTooLong", value: "x".repeat(120) },
    });
  });

  it("falls back to a generic field error when the form itself looks valid", () => {
    expect(preferenceErrorsFromServer([{ path: "preferredSalary.currency", message: "x" }], base)).toEqual({
      preferredSalary: { code: "invalid" },
    });
  });

  it("returns nothing for a body it doesn't recognise", () => {
    expect(preferenceErrorsFromServer(undefined, base)).toEqual({});
    expect(preferenceErrorsFromServer([{ path: "summary", message: "x" }], base)).toEqual({});
  });
});

describe("jobSeekerProfileUpdateSchema — salary range", () => {
  it("rejects a minimum above the maximum", () => {
    const res = jobSeekerProfileUpdateSchema.safeParse({ preferredSalary: { min: 90000, max: 70000, currency: "INR" } });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].path).toEqual(["preferredSalary", "max"]);
  });

  it("still accepts open-ended and currency-only salaries", () => {
    expect(jobSeekerProfileUpdateSchema.safeParse({ preferredSalary: { min: 150000, max: 0, currency: "INR" } }).success).toBe(true);
    expect(jobSeekerProfileUpdateSchema.safeParse({ preferredSalary: { currency: "USD" } }).success).toBe(true);
    expect(jobSeekerProfileUpdateSchema.safeParse({ preferredSalary: { min: 30000, max: 70000, currency: "INR" } }).success).toBe(true);
  });
});
