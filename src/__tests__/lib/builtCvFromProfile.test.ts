import { builderProfilePayload, builtCvFromProfile, certificateText, parseCertificate } from "@/lib/onboarding/builtCvFromProfile";
import { cvDesignSchema } from "@/lib/jobSeeker/cvDesign";
import type { CvBuilderResult } from "@/components/features/job-seeker/cv-wizard/types";

const built: CvBuilderResult = {
  targetRole: "Accountant",
  fresher: false,
  jobs: [{ title: "Cashier", organisation: "Lulu", start: "2022-05", end: "", current: true, description: "• Handled billing" }],
  projects: [{ title: "GST filing tool", organisation: "College", start: "", end: "", current: false, description: "• Built forms" }],
  education: [
    { level: "graduation", course: "B.Com", field: "Finance", institution: "St. Thomas College", startYear: "2019", endYear: "2022", studying: false, grade: "78%" },
    { level: "12th", course: "Commerce", field: "", institution: "GHSS Tirur", startYear: "2017", endYear: "2019", studying: false, grade: "" },
  ],
  skills: ["Tally", "Excel"],
  languages: [{ language: "English", proficiency: "professional" }],
  certificates: [{ name: "Tally Prime", issuer: "NIIT", year: "2023" }],
  linkedin: "linkedin.com/in/arun",
  portfolio: "",
  otherLinks: [{ label: "GitHub", url: "github.com/arun" }, { label: "Bad", url: "not a link" }],
  summary: "Commerce graduate.",
  templateId: "modern",
};

describe("builderProfilePayload", () => {
  it("stores what the builder collected the way the profile and onboarding expect", () => {
    const p = builderProfilePayload(built, ["Cashier", "accountant"]);
    expect(p.preferredRoles).toEqual(["Accountant", "Cashier"]);
    expect(p.certifications).toEqual(["Tally Prime — NIIT (2023)"]);
    expect(p.socialLinks).toEqual([
      { label: "LinkedIn", url: "https://www.linkedin.com/in/arun" },
      { label: "GitHub", url: "https://github.com/arun" },
    ]);
    // The profile rejects a partial design, so it must pass the real schema.
    expect(cvDesignSchema.parse(p.cvDesign)).toMatchObject({ templateId: "modern", hiddenSections: [] });
    expect(p.projects).toEqual([expect.objectContaining({ title: "GST filing tool — College" })]);
    expect(p.education).toEqual([
      expect.objectContaining({ degree: "Graduation (Bachelor's)", course: "B.Com", field: "Finance", institution: "St. Thomas College", startYear: 2019, graduationDate: "2022-12-31T00:00:00.000Z", grade: "78%" }),
      expect.objectContaining({ degree: "12th", course: "Commerce", institution: "GHSS Tirur" }),
    ]);
  });

  it("leaves a fresher's jobs out", () => {
    expect(builderProfilePayload({ ...built, fresher: true }).experience).toBeUndefined();
  });
});

describe("builtCvFromProfile", () => {
  it("is null for an empty or onboarding-only profile", () => {
    expect(builtCvFromProfile(null)).toBeNull();
    expect(builtCvFromProfile({ skills: ["Sales"], experience: [{ jobTitle: "Clerk", company: "Lulu" }] })).toBeNull();
  });

  it("is null when the seeker uploaded a CV file", () => {
    expect(builtCvFromProfile({ cv: { originalUrl: "https://x/cv.pdf" }, summary: "Retail associate." })).toBeNull();
  });

  it("reads back what the builder saved", () => {
    const p = builderProfilePayload(built);
    const back = builtCvFromProfile({ ...p, workStatus: "experienced" } as Parameters<typeof builtCvFromProfile>[0]);
    expect(back).toMatchObject({
      targetRole: "Accountant",
      fresher: false,
      jobs: [{ title: "Cashier", organisation: "Lulu", start: "2022-05", current: true }],
      projects: [{ title: "GST filing tool", organisation: "College" }],
      education: [
        { level: "graduation", course: "B.Com", field: "Finance", startYear: "2019", endYear: "2022", studying: false, grade: "78%" },
        { level: "12th", course: "Commerce", institution: "GHSS Tirur" },
      ],
      skills: ["Tally", "Excel"],
      certificates: [{ name: "Tally Prime", issuer: "NIIT", year: "2023" }],
      linkedin: "https://www.linkedin.com/in/arun",
      otherLinks: [{ label: "GitHub", url: "https://github.com/arun" }],
      summary: "Commerce graduate.",
      templateId: "modern",
    });
  });
});

describe("certificates", () => {
  it("round-trips name, issuer and year", () => {
    for (const c of [{ name: "IELTS 7.0", issuer: "", year: "" }, { name: "AWS", issuer: "Amazon", year: "2024" }, { name: "First Aid", issuer: "", year: "2021" }]) {
      expect(parseCertificate(certificateText(c))).toEqual(c);
    }
  });
});
