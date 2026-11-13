"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SocialShareDetails } from "@/components/features/public/SocialShare";
import { shareSalaryFigure, type ShareSalary } from "@/lib/jobs/shareMessage";

interface ShareableJob {
  employerId?: { companyName?: string } | null;
  salary?: ShareSalary;
  employmentType?: string;
  workMode?: string;
  requirements?: { skills?: string[] };
}

/** The company, place, pay, type and skills a shared job message carries. */
export function useJobShareDetails(job: ShareableJob | undefined, location: string): SocialShareDetails | undefined {
  const t = useTranslations("socialShare");
  const locale = useLocale();
  return useMemo(() => {
    if (!job) return undefined;
    // Literal keys only — a template-literal key escapes the missing-key checks.
    const employment = (() => {
      switch (job.employmentType) {
        case "full_time": return t("employment.full_time");
        case "part_time": return t("employment.part_time");
        case "contract": return t("employment.contract");
        case "internship": return t("employment.internship");
        case "freelance": return t("employment.freelance");
        default: return undefined;
      }
    })();
    const mode = (() => {
      switch (job.workMode) {
        case "onsite": return t("workMode.onsite");
        case "hybrid": return t("workMode.hybrid");
        case "remote": return t("workMode.remote");
        default: return undefined;
      }
    })();
    const figure = shareSalaryFigure(job.salary, locale);
    return {
      company: job.employerId?.companyName,
      location: location || undefined,
      salary: !figure
        ? job.salary?.isNegotiable ? t("salaryNegotiable") : undefined
        : job.salary?.isNegotiable ? t("salaryFigureNegotiable", { amount: figure }) : t("salaryFigure", { amount: figure }),
      type: [employment, mode].filter(Boolean).join(" · ") || undefined,
      skills: job.requirements?.skills ?? [],
    };
  }, [job, location, locale, t]);
}
