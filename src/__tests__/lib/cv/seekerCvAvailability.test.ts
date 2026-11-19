import { hasBuiltCvContent, seekerCvAvailability, type BuiltCvSource } from "@/lib/cv/seekerCvAvailability";

describe("seekerCvAvailability", () => {
  it("an empty profile has no CV of either kind", () => {
    expect(seekerCvAvailability({})).toEqual({ hasCv: false, canBuildCv: false });
    expect(seekerCvAvailability({ skills: [], experience: [], cv: {}, documents: [] })).toEqual({ hasCv: false, canBuildCv: false });
  });

  it("an uploaded CV or a resume document is an uploaded file", () => {
    expect(seekerCvAvailability({ cv: { originalUrl: "https://x/cv.pdf" } }).hasCv).toBe(true);
    expect(seekerCvAvailability({ documents: [{ category: "resume", url: "u" }] }).hasCv).toBe(true);
    expect(seekerCvAvailability({ documents: [{ category: "certificate", url: "u" }] }).hasCv).toBe(false);
  });

  it("experience, education, skills or a summary can build the Standardised CV", () => {
    for (const part of [{ summary: "s" }, { skills: ["a"] }, { experience: [{}] }, { education: [{}] }]) {
      expect(seekerCvAvailability(part).canBuildCv).toBe(true);
    }
  });

  it("languages alone cannot: the server's rule wins, so View CV and the export agree", () => {
    expect(seekerCvAvailability({ languages: [{}] }).canBuildCv).toBe(false);
    expect(hasBuiltCvContent({ languages: [{}] } as BuiltCvSource)).toBe(false);
  });
});

describe("hasBuiltCvContent respects the sections the candidate hid", () => {
  const design = (hiddenSections: string[]) => ({ cvDesign: { hiddenSections } });

  it("counts only what is shown: a candidate who hid everything has no Standardised CV", () => {
    const profile = { experience: [{}], education: [{}], skills: ["a"], ...design(["experience", "education", "skills"]) };
    expect(hasBuiltCvContent(profile)).toBe(false);
    expect(seekerCvAvailability(profile).canBuildCv).toBe(false);
  });

  it("still has one while any counted section is shown", () => {
    expect(hasBuiltCvContent({ experience: [{}], skills: ["a"], ...design(["experience"]) })).toBe(true);
    expect(hasBuiltCvContent({ education: [{}], ...design(["experience", "skills"]) })).toBe(true);
  });

  it("a summary cannot be hidden, so it keeps the CV alive", () => {
    expect(hasBuiltCvContent({ summary: "s", experience: [{}], ...design(["experience", "education", "skills"]) })).toBe(true);
  });

  it("hiding sections that are not counted (languages, projects, certifications) changes nothing", () => {
    expect(hasBuiltCvContent({ skills: ["a"], ...design(["languages", "projects", "certifications"]) })).toBe(true);
  });

  it("no saved design, or no hidden list, is the old rule", () => {
    expect(hasBuiltCvContent({ skills: ["a"], cvDesign: null })).toBe(true);
    expect(hasBuiltCvContent({ skills: ["a"], cvDesign: {} })).toBe(true);
    expect(hasBuiltCvContent({ skills: ["a"], cvDesign: { hiddenSections: null } })).toBe(true);
  });
});

