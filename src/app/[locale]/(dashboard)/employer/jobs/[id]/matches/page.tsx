"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { JobMatches } from "@/components/features/jobs/matching/JobMatches";

/**
 * Suitable profiles tab: candidates in the database who allow employers to
 * find them, ranked for this job, each with an invite to apply (client
 * rollout 2026-10-27: "Suitable profiles for jobs to notify (Email) — option
 * is not in detailed job view"). Candidates who already applied are on the
 * Applications tab instead.
 */
export default function JobMatchesTabPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("employerJobWorkspace");
  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>{t("matchesHeading")}</h2>
      <JobMatches jobId={id} role="employer" applicantsHref={`/${locale}/employer/jobs/${id}/applications`} />
    </>
  );
}
