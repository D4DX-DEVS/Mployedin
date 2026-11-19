import { arabicLetterShare, cvHasArabic, hasArabicScript, isRtlCv } from "@/lib/cv/scriptDirection";

describe("hasArabicScript", () => {
  it("is true for Arabic letters, even among Latin ones", () => {
    expect(hasArabicScript("سارة")).toBe(true);
    expect(hasArabicScript("Acme شركة")).toBe(true);
  });

  it("is false for Latin, empty and non-letter text", () => {
    expect(hasArabicScript("Sarah Ahmed")).toBe(false);
    expect(hasArabicScript("")).toBe(false);
    expect(hasArabicScript("2020 - 2024 (+971)")).toBe(false);
  });
});

describe("arabicLetterShare", () => {
  it("is 1 for pure Arabic and 0 for pure Latin", () => {
    expect(arabicLetterShare("سارة أحمد")).toBe(1);
    expect(arabicLetterShare("Sarah Ahmed")).toBe(0);
  });

  it("ignores digits, spaces, punctuation and combining marks", () => {
    expect(arabicLetterShare("سارة 123 - ، .")).toBe(1);
    expect(arabicLetterShare("مُحَمَّد")).toBe(1);
  });

  it("is 0 when there are no letters at all", () => {
    expect(arabicLetterShare("")).toBe(0);
    expect(arabicLetterShare("123 456")).toBe(0);
  });

  it("is the fraction of Arabic among all letters", () => {
    // 3 Arabic + 3 Latin
    expect(arabicLetterShare("abc سار")).toBeCloseTo(0.5, 5);
    // 4 Arabic + 1 Latin
    expect(arabicLetterShare("سارة a")).toBeCloseTo(0.8, 5);
  });

  it("counts Arabic presentation forms and the Arabic Supplement block", () => {
    expect(arabicLetterShare("ﻣﺮﺣﺒﺎ")).toBe(1); // presentation forms B
    expect(arabicLetterShare("ݐݑݒ")).toBe(1); // Arabic Supplement
  });
});

describe("isRtlCv", () => {
  it("is true when the name and summary are mainly Arabic", () => {
    expect(isRtlCv({ fullName: "سارة أحمد", headline: "محاسبة أولى بخبرة ثماني سنوات في الإمارات" })).toBe(true);
  });

  it("is true for an Arabic name alone", () => {
    expect(isRtlCv({ fullName: "سارة أحمد", headline: "" })).toBe(true);
  });

  it("is false for an English CV, and for an empty one", () => {
    expect(isRtlCv({ fullName: "Sarah Ahmed", headline: "Senior accountant with eight years in the UAE" })).toBe(false);
    expect(isRtlCv({ fullName: "", headline: "" })).toBe(false);
  });

  it("is false for an English profile that only mentions an Arabic company", () => {
    expect(isRtlCv({ fullName: "Sarah Ahmed", headline: "Finance lead at شركة النور for Gulf clients and regional banks" })).toBe(false);
  });

  it("pools the letters of the name and the summary", () => {
    // Latin name (5 letters) + a long Arabic summary: Arabic is the majority.
    expect(isRtlCv({ fullName: "Sarah", headline: "محاسبة أولى بخبرة طويلة" })).toBe(true);
    // Short Arabic name (4 letters) + a long English summary: Latin is the majority.
    expect(isRtlCv({ fullName: "سارة", headline: "Senior accountant" })).toBe(false);
  });

  it("needs MORE than half: an exact tie stays left-to-right", () => {
    expect(isRtlCv({ fullName: "abc", headline: "سار" })).toBe(false);
  });
});

describe("cvHasArabic", () => {
  const ENGLISH = { fullName: "Sarah Ahmed", skills: ["Excel"], experience: [{ jobTitle: "Accountant", company: "Acme" }] };

  it("is false when nothing in the CV or its labels is Arabic", () => {
    expect(cvHasArabic({ data: ENGLISH, labels: { experience: "Experience" } })).toBe(false);
    expect(cvHasArabic({ data: ENGLISH })).toBe(false);
  });

  it("finds Arabic anywhere in the form, however deep", () => {
    expect(cvHasArabic({ data: { ...ENGLISH, fullName: "سارة" } })).toBe(true);
    expect(cvHasArabic({ data: { ...ENGLISH, skills: ["Excel", "اللغة العربية"] } })).toBe(true);
    expect(cvHasArabic({ data: { ...ENGLISH, experience: [{ jobTitle: "Accountant", company: "شركة النور" }] } })).toBe(true);
    expect(cvHasArabic({ data: { ...ENGLISH, certifications: ["CPA"], projects: [{ title: "ERP", techStack: ["مشروع"] }] } })).toBe(true);
  });

  it("counts the labels too: an English CV printed with Arabic headings has Arabic in it", () => {
    expect(cvHasArabic({ data: ENGLISH, labels: { experience: "الخبرات", proficiency: { native: "لغة أم" } } })).toBe(true);
  });
});
