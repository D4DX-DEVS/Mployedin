/**
 * Standardised CV headings follow the CV's own language (Arabic when the CV
 * reads right to left, English otherwise), not the language of the screen.
 */
import en from "../../../../messages/en.json";
import ar from "../../../../messages/ar.json";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import {
  builtCvLabelLang,
  createCvPdfLabelsLoader,
  cvLabelLang,
  cvPdfLabelsFromMessages,
  labelLangOfLocale,
  loadCvPdfLabels,
  resolveCvPdfLabels,
} from "@/lib/cv/cvPdfLabels";

const EN = en.cvBuilderPage;
const AR = ar.cvBuilderPage;

const UI_LABELS = { yourName: "ui", present: "ui present" } as unknown as CVPDFLabels;

function built(fullName: string, summary: string): BuiltCvResponse {
  return { hasContent: true, identity: { fullName, email: "a@example.com", phone: "" }, profile: { summary } };
}

describe("cvPdfLabelsFromMessages", () => {
  it("reads the English headings, proficiency names and the company placeholder", () => {
    const labels = cvPdfLabelsFromMessages(en as never, "en");
    expect(labels.experience).toBe(EN.previewSections.experience);
    expect(labels.present).toBe("Present");
    expect(labels.proficiency).toEqual({
      basic: EN.proficiency.basic,
      conversational: EN.proficiency.conversational,
      professional: EN.proficiency.professional,
      native: EN.proficiency.native,
    });
    expect(labels.atCompany).toBe("at {company}");
  });

  it("reads the Arabic ones from the Arabic catalogue", () => {
    const labels = cvPdfLabelsFromMessages(ar as never, "ar");
    expect(labels.experience).toBe(AR.previewSections.experience);
    expect(labels.present).toBe(AR.previewSections.present);
    expect(labels.proficiency.native).toBe(AR.proficiency.native);
    expect(labels.present).not.toBe("Present");
    expect(labels.atCompany).toContain("{company}");
  });

  it("fills every label (none is missing or empty) in both languages", () => {
    for (const [messages, locale] of [[en, "en"], [ar, "ar"]] as const) {
      const labels = cvPdfLabelsFromMessages(messages as never, locale);
      const strings = [...Object.values(labels).filter((v) => typeof v === "string"), ...Object.values(labels.proficiency)];
      expect(strings).toHaveLength(21);
      for (const s of strings) expect((s as string).length).toBeGreaterThan(0);
    }
  });

  it("works on just the two sub-trees the hook reads", () => {
    const slim = { cvBuilderPage: { previewSections: AR.previewSections, proficiency: AR.proficiency } };
    expect(cvPdfLabelsFromMessages(slim as never, "ar")).toEqual(cvPdfLabelsFromMessages(ar as never, "ar"));
  });
});

describe("label language", () => {
  it("is Arabic for an Arabic UI locale, English for anything else", () => {
    expect(labelLangOfLocale("ar")).toBe("ar");
    expect(labelLangOfLocale("ar-EG")).toBe("ar");
    expect(labelLangOfLocale("en")).toBe("en");
    expect(labelLangOfLocale("fr")).toBe("en");
    expect(labelLangOfLocale(undefined)).toBe("en");
  });

  it("follows the CV: Arabic name and summary -> Arabic, English -> English", () => {
    expect(cvLabelLang({ fullName: "أمينة حسن", headline: "محاسبة أولى" })).toBe("ar");
    expect(cvLabelLang({ fullName: "Amina Hassan", headline: "Senior accountant" })).toBe("en");
  });

  it("is English for a mostly-English CV that has an Arabic word, and for an empty one", () => {
    expect(cvLabelLang({ fullName: "Amina Hassan", headline: "Accountant at شركة" })).toBe("en");
    expect(cvLabelLang({ fullName: "", headline: "" })).toBe("en");
  });

  it("is read from the details the CV route returns (name + summary)", () => {
    expect(builtCvLabelLang(built("أمينة حسن", "محاسبة أولى"))).toBe("ar");
    expect(builtCvLabelLang(built("Amina Hassan", "Senior accountant"))).toBe("en");
  });
});

describe("createCvPdfLabelsLoader", () => {
  const catalogues = { en, ar } as const;

  it("loads a language once and keeps only its labels", async () => {
    const importer = jest.fn(async (lang: "en" | "ar") => catalogues[lang] as never);
    const load = createCvPdfLabelsLoader(importer);
    const first = await load("ar");
    const second = await load("ar");
    expect(second).toBe(first);
    expect(first.experience).toBe(AR.previewSections.experience);
    expect(importer).toHaveBeenCalledTimes(1);
    await load("en");
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failed load: the next CV tries again", async () => {
    const importer = jest
      .fn<Promise<never>, ["en" | "ar"]>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockImplementation(async (lang) => catalogues[lang] as never);
    const load = createCvPdfLabelsLoader(importer);
    await expect(load("ar")).rejects.toThrow("chunk failed");
    await expect(load("ar")).resolves.toMatchObject({ experience: AR.previewSections.experience });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("the default loader reads the real catalogues", async () => {
    expect((await loadCvPdfLabels("en")).experience).toBe(EN.previewSections.experience);
    expect((await loadCvPdfLabels("ar")).experience).toBe(AR.previewSections.experience);
  });
});

describe("resolveCvPdfLabels", () => {
  it("English UI + Arabic CV -> Arabic labels", async () => {
    const labels = await resolveCvPdfLabels("ar", "en", UI_LABELS);
    expect(labels.experience).toBe(AR.previewSections.experience);
    expect(labels).not.toBe(UI_LABELS);
  });

  it("Arabic UI + English CV -> English labels", async () => {
    const labels = await resolveCvPdfLabels("en", "ar", UI_LABELS);
    expect(labels.experience).toBe(EN.previewSections.experience);
    expect(labels.present).toBe("Present");
  });

  it("uses the screen's own labels, and loads nothing, when the CV is in the screen's language", async () => {
    const load = jest.fn();
    expect(await resolveCvPdfLabels("en", "en", UI_LABELS, load)).toBe(UI_LABELS);
    expect(await resolveCvPdfLabels("ar", "ar-EG", UI_LABELS, load)).toBe(UI_LABELS);
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to the screen's labels when the other language cannot be loaded", async () => {
    const load = jest.fn().mockRejectedValue(new Error("offline"));
    await expect(resolveCvPdfLabels("ar", "en", UI_LABELS, load)).resolves.toBe(UI_LABELS);
  });
});
