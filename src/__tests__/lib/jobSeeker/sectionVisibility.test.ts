import { withoutHiddenSections } from "@/lib/jobSeeker/sectionVisibility";

describe("withoutHiddenSections", () => {
  const seeker = {
    headline: "Nurse",
    skills: ["triage"],
    experience: [{ jobTitle: "Nurse" }],
    education: [{ degree: "BSc" }],
    certifications: [{ name: "BLS" }],
    accomplishments: ["award"],
  };

  it("drops the sections the person hid and the visibility map itself", () => {
    const out = withoutHiddenSections({ ...seeker, sectionVisibility: { skills: false, accomplishments: false, education: true } });
    expect(out).not.toHaveProperty("skills");
    expect(out).not.toHaveProperty("certifications");
    expect(out).not.toHaveProperty("accomplishments");
    expect(out).not.toHaveProperty("sectionVisibility");
    expect(out).toMatchObject({ headline: "Nurse", education: [{ degree: "BSc" }], experience: [{ jobTitle: "Nurse" }] });
  });

  it("reads a Mongoose Map and ignores unknown keys", () => {
    const out = withoutHiddenSections({ ...seeker, sectionVisibility: new Map([["experience", false], ["headline", false]]) });
    expect(out).not.toHaveProperty("experience");
    expect(out).toHaveProperty("headline", "Nurse");
  });

  it("leaves a profile with nothing hidden untouched", () => {
    expect(withoutHiddenSections({ ...seeker })).toEqual(seeker);
  });
});
