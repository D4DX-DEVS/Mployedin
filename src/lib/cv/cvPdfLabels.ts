/* ── The words a CV PDF is printed with, in the CV's own language ──
   A standardised CV is read by staff in whatever language their screen is in,
   but the CV itself is English or Arabic. Its headings ("Experience",
   "Present", "Native"...) follow the CV, not the viewer: an Arabic CV reads in
   Arabic under an English screen and the other way round.

   Pure apart from the lazy message load. The labels are built from the same
   two message sub-trees the builder's hook reads (cvBuilderPage.previewSections
   and cvBuilderPage.proficiency), through next-intl's createTranslator, so
   both ways of getting labels cannot drift. The OTHER language's catalogue is
   imported only when a CV needs it, and only its labels are kept. */

import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { cvFormFromProfile, EMPTY_CV_FORM } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import type { CVForm } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import { buildCvPdfLabels, type CvPdfTranslate } from "@/lib/cv/buildCvPdfLabels";
import { isRtlCv } from "@/lib/cv/scriptDirection";

export type CvLabelLang = "en" | "ar";

export { buildCvPdfLabels, type CvPdfTranslate } from "@/lib/cv/buildCvPdfLabels";

/** The labels from a message catalogue (whole, or just cvBuilderPage's two sub-trees). */
export function cvPdfLabelsFromMessages(messages: AbstractIntlMessages, locale: string): CVPDFLabels {
  const t = createTranslator({ locale, messages, namespace: "cvBuilderPage.previewSections" }) as unknown as CvPdfTranslate;
  const p = createTranslator({ locale, messages, namespace: "cvBuilderPage.proficiency" }) as unknown as CvPdfTranslate;
  return buildCvPdfLabels(t, p);
}

/** The label language for an interface locale ("ar", "ar-EG" -> Arabic; anything else English). */
export function labelLangOfLocale(locale: string | null | undefined): CvLabelLang {
  return typeof locale === "string" && locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** Arabic for a CV that reads right to left (isRtlCv), English otherwise. */
export function cvLabelLang(form: Pick<CVForm, "fullName" | "headline">): CvLabelLang {
  return isRtlCv(form) ? "ar" : "en";
}

/** The label language of a built CV, from the details the CV route returns. */
export function builtCvLabelLang(data: BuiltCvResponse): CvLabelLang {
  const form = cvFormFromProfile(data.profile, {
    ...EMPTY_CV_FORM,
    fullName: data.identity.fullName,
    email: data.identity.email,
    phone: data.identity.phone,
  });
  return cvLabelLang(form);
}

/** Loads one language's message catalogue. Dynamic, so neither catalogue joins a bundle until needed. */
export type CvMessagesImporter = (lang: CvLabelLang) => Promise<AbstractIntlMessages>;

/** Just the two sub-trees the labels read: a whole catalogue is never kept. */
interface CvLabelMessages {
  cvBuilderPage: {
    previewSections: Record<string, string>;
    proficiency: Record<string, string>;
  };
}

const pickLabelMessages = (catalogue: CvLabelMessages): AbstractIntlMessages => ({
  cvBuilderPage: {
    previewSections: catalogue.cvBuilderPage.previewSections,
    proficiency: catalogue.cvBuilderPage.proficiency,
  },
});

const importCatalogue: CvMessagesImporter = async (lang) =>
  pickLabelMessages(
    lang === "ar"
      ? (await import("../../../messages/ar.json")).default
      : (await import("../../../messages/en.json")).default,
  );

export type CvPdfLabelsLoader = (lang: CvLabelLang) => Promise<CVPDFLabels>;

/**
 * A loader that keeps each language's labels once loaded (the catalogue itself
 * is dropped, only the 22 strings stay). A failed load is not remembered, so
 * the next CV tries again.
 */
export function createCvPdfLabelsLoader(importer: CvMessagesImporter = importCatalogue): CvPdfLabelsLoader {
  const cache = new Map<CvLabelLang, Promise<CVPDFLabels>>();
  return (lang) => {
    let pending = cache.get(lang);
    if (!pending) {
      pending = importer(lang).then((messages) => cvPdfLabelsFromMessages(messages, lang));
      cache.set(lang, pending);
      pending.catch(() => {
        if (cache.get(lang) === pending) cache.delete(lang);
      });
    }
    return pending;
  };
}

export const loadCvPdfLabels: CvPdfLabelsLoader = createCvPdfLabelsLoader();

/**
 * The labels to print a CV with: the screen's own `uiLabels` when the CV is in
 * the screen's language, else the CV language's, loaded now. Never rejects: if
 * the other language cannot be loaded the CV is printed with the screen's labels.
 */
export async function resolveCvPdfLabels(
  lang: CvLabelLang,
  uiLocale: string | null | undefined,
  uiLabels: CVPDFLabels,
  load: CvPdfLabelsLoader = loadCvPdfLabels,
): Promise<CVPDFLabels> {
  if (lang === labelLangOfLocale(uiLocale)) return uiLabels;
  try {
    return await load(lang);
  } catch {
    return uiLabels;
  }
}
