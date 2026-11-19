/* The one mapping from the two CV label message sub-trees (cvBuilderPage.previewSections
   and cvBuilderPage.proficiency) to the PDF's labels. Tiny and free of heavy imports, so
   the public job page's hook (use-cv-pdf-labels.ts) can share it with cvPdfLabels.ts. */

import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";

export type CvPdfTranslate = (key: string, values?: Record<string, string>) => string;

/**
 * The one mapping from the two message sub-trees to the PDF's labels. Used by
 * the builder's hook (useCvPdfLabels, with next-intl's own translators) and by
 * cvPdfLabelsFromMessages.
 */
export function buildCvPdfLabels(t: CvPdfTranslate, p: CvPdfTranslate): CVPDFLabels {
  return {
    yourName: t("yourName"),
    present: t("present"),
    experience: t("experience"),
    education: t("education"),
    grade: t("grade"),
    skills: t("skills"),
    projects: t("projects"),
    languages: t("languages"),
    certifications: t("certifications"),
    professionalExperience: t("professionalExperience"),
    keyProjects: t("keyProjects"),
    coreCompetencies: t("coreCompetencies"),
    decoratedExperience: t("decoratedExperience"),
    decoratedEducation: t("decoratedEducation"),
    decoratedSkills: t("decoratedSkills"),
    decoratedProjects: t("decoratedProjects"),
    // The renderer fills in the company: the placeholder is kept as it is.
    atCompany: t("atCompany", { company: "{company}" }),
    proficiency: {
      basic: p("basic"),
      conversational: p("conversational"),
      professional: p("professional"),
      native: p("native"),
    },
  };
}
