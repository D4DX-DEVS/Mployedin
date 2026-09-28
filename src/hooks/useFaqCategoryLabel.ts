"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/**
 * Words for an FAQ category key ("job_seeker" → "Job seekers"). Shared by the
 * public FAQ page and the admin FAQ form so both say the same thing. A key
 * outside lib/cms/faqCategories falls back to itself rather than calling t()
 * with an unknown key, which throws.
 */
export function useFaqCategoryLabel(): (category: string) => string {
  const t = useTranslations("landing");
  return useCallback(
    (category: string) => {
      switch (category) {
        case "general": return t("faqCategory.general");
        case "job_seeker": return t("faqCategory.job_seeker");
        case "employer": return t("faqCategory.employer");
        case "agent": return t("faqCategory.agent");
        case "billing": return t("faqCategory.billing");
        case "privacy": return t("faqCategory.privacy");
        default: return category;
      }
    },
    [t],
  );
}
