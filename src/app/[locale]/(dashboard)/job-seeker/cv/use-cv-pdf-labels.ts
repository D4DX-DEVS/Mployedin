"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CVPDFLabels } from "./pdf/shared";

/**
 * The section headings a CV PDF is printed with, in the reader's language.
 * Shared by the builder's download and the apply dialogs, so the CV sent with
 * an application reads the same as the one the seeker downloaded.
 *
 * Read as two sub-trees of `cvBuilderPage`, not the whole namespace: the
 * public job page is handed only the messages it lists (lib/i18n/
 * clientMessages.ts) and must not carry the entire builder for 22 strings.
 */
export function useCvPdfLabels(): CVPDFLabels {
  const t = useTranslations("cvBuilderPage.previewSections");
  const p = useTranslations("cvBuilderPage.proficiency");
  return useMemo(
    () => ({
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
      atCompany: t("atCompany", { company: "{company}" }),
      proficiency: {
        basic: p("basic"),
        conversational: p("conversational"),
        professional: p("professional"),
        native: p("native"),
      },
    }),
    [t, p],
  );
}
