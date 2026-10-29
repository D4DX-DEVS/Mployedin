/**
 * @jest-environment node
 */
import { ageOn, dateOfBirthProblem, latestAllowedDateOfBirth } from "@/lib/jobSeeker/minimumAge";
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";

const NOW = new Date("2026-10-28T12:00:00Z");

describe("minimum job-seeker age (16)", () => {
  it("counts whole years, turning over on the birthday", () => {
    expect(ageOn("2010-10-28", NOW)).toBe(16);
    expect(ageOn("2010-10-29", NOW)).toBe(15);
    expect(ageOn("not a date", NOW)).toBeNull();
  });

  it("accepts 16 and over, refuses younger, and refuses impossible dates", () => {
    expect(dateOfBirthProblem("2010-10-28", NOW)).toBeNull();
    expect(dateOfBirthProblem("2010-10-29", NOW)).toBe("tooYoung");
    expect(dateOfBirthProblem("2030-01-01", NOW)).toBe("invalid");
    expect(dateOfBirthProblem("1890-01-01", NOW)).toBe("invalid");
    expect(dateOfBirthProblem("31/12/2000", NOW)).toBe("invalid");
  });

  it("gives the date input's latest allowed day", () => {
    expect(latestAllowedDateOfBirth(NOW)).toBe("2010-10-28");
  });

  it("the profile PATCH schema refuses a birth date under 16 (server-side)", () => {
    const thisYear = new Date().getUTCFullYear();
    expect(jobSeekerProfileUpdateSchema.safeParse({ dateOfBirth: `${thisYear - 10}-01-01` }).success).toBe(false);
    expect(jobSeekerProfileUpdateSchema.safeParse({ dateOfBirth: `${thisYear - 30}-01-01` }).success).toBe(true);
    expect(jobSeekerProfileUpdateSchema.safeParse({}).success).toBe(true);
  });
});
