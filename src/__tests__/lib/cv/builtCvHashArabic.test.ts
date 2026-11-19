/**
 * builtCvHash decides whether a stored built-CV PDF can be reused. PDFs made
 * before the Arabic fixes (fonts, right-to-left layout) are broken for Arabic
 * seekers, so the hash of a CV with Arabic in it carries a render version:
 * those seekers get a fresh copy on their next apply, and nobody else does.
 */
import { EMPTY_CV_FORM, ARABIC_RENDER_VERSION, builtCvHash } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { DEFAULT_FORMATTING, type CVForm } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";

const LABELS: CVPDFLabels = {
  yourName: "Your name", present: "Present", experience: "Experience", education: "Education", grade: "Grade",
  skills: "Skills", projects: "Projects", languages: "Languages", certifications: "Certifications",
  professionalExperience: "Professional Experience", keyProjects: "Key Projects", coreCompetencies: "Core Competencies",
  decoratedExperience: "Experience", decoratedEducation: "Education", decoratedSkills: "Skills", decoratedProjects: "Projects",
  atCompany: "at {company}",
  proficiency: { basic: "Basic", conversational: "Conversational", professional: "Professional", native: "Native" },
};

const ARABIC_LABELS: CVPDFLabels = { ...LABELS, experience: "الخبرات", present: "حتى الآن" };

const ENGLISH_CV: CVForm = {
  ...EMPTY_CV_FORM,
  fullName: "Sarah Ahmed",
  email: "sarah@example.com",
  headline: "Senior accountant",
  photo: "https://cdn.example.com/a.png?sig=abc",
  skills: ["Excel", "IFRS"],
  experience: [{ jobTitle: "Accountant", company: "Acme", country: "UAE", startDate: "2020-01", endDate: "", isCurrent: true, description: "<p>Closed the books.</p>" }],
};

const ARABIC_CV: CVForm = {
  ...ENGLISH_CV,
  fullName: "سارة أحمد",
  headline: "محاسبة أولى",
  experience: [{ jobTitle: "محاسبة", company: "شركة النور", country: "الإمارات", startDate: "2020-01", endDate: "", isCurrent: true, description: "<p>إقفال الدفاتر.</p>" }],
};

const input = (data: CVForm, labels: CVPDFLabels = LABELS, templateId = "classic") => ({ data, templateId, formatting: DEFAULT_FORMATTING, labels });

describe("builtCvHash: English CVs are untouched", () => {
  // Captured from the hash function BEFORE the render version existed: a stored
  // English built CV keeps matching, so no English seeker gets a new copy.
  it("gives the exact hashes it always gave", () => {
    expect(builtCvHash(input(ENGLISH_CV))).toBe("01c4c699a074ff");
    expect(builtCvHash(input(ENGLISH_CV, LABELS, "modern"))).toBe("0074adab399658");
    expect(builtCvHash(input(EMPTY_CV_FORM))).toBe("05d7d931d18e91");
  });

  it("ignores the signature on a signed photo link, as before", () => {
    expect(builtCvHash(input({ ...ENGLISH_CV, photo: "https://cdn.example.com/a.png?sig=other" }))).toBe(builtCvHash(input(ENGLISH_CV)));
  });

  it("does not depend on the render version at all", () => {
    // the version must not leak into an English hash through some default value
    const before = builtCvHash(input(ENGLISH_CV));
    expect(ARABIC_RENDER_VERSION).toBeGreaterThan(1);
    expect(builtCvHash(input(ENGLISH_CV))).toBe(before);
  });
});

describe("builtCvHash: CVs with Arabic carry the render version", () => {
  it("differs from what the same CV hashed to before the Arabic fixes, so the old PDF is not reused", () => {
    // the hash the previous algorithm gave this very input (no render version)
    expect(builtCvHash(input(ARABIC_CV))).not.toBe("04f83d1ec4c8f7");
  });

  it("is stable: the same Arabic CV always hashes the same", () => {
    expect(builtCvHash(input(ARABIC_CV))).toBe(builtCvHash(input(ARABIC_CV)));
  });

  it("still tells different Arabic CVs apart, and different templates apart", () => {
    const other = { ...ARABIC_CV, headline: "مدققة داخلية" };
    expect(builtCvHash(input(other))).not.toBe(builtCvHash(input(ARABIC_CV)));
    expect(builtCvHash(input(ARABIC_CV, LABELS, "modern"))).not.toBe(builtCvHash(input(ARABIC_CV)));
  });

  it("changes when the render version is bumped (the next Arabic fix redraws them again)", () => {
    expect(builtCvHash(input(ARABIC_CV), ARABIC_RENDER_VERSION + 1)).not.toBe(builtCvHash(input(ARABIC_CV)));
    // ...but never for English: bumping it must not make every English seeker rebuild
    expect(builtCvHash(input(ENGLISH_CV), ARABIC_RENDER_VERSION + 1)).toBe(builtCvHash(input(ENGLISH_CV)));
  });

  it("applies when only the labels are Arabic (an English CV printed with Arabic headings)", () => {
    expect(builtCvHash(input(ENGLISH_CV, ARABIC_LABELS))).not.toBe("020497e41b5dac");
    expect(builtCvHash(input(ENGLISH_CV, ARABIC_LABELS))).not.toBe(builtCvHash(input(ENGLISH_CV)));
  });

  it("applies when Arabic is only in a corner of the CV (one skill)", () => {
    const corner = { ...ENGLISH_CV, skills: ["Excel", "اللغة العربية"] };
    expect(builtCvHash(input(corner))).not.toBe("15c9c9d8f2a3e2");
  });
});
