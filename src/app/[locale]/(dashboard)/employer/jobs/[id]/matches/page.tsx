"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { JobMatches } from "@/components/features/jobs/matching/JobMatches";

/**
 * Suitable profiles tab: candidates in the database who allow employers to
 * find them and share a skill or a role with this job, best fit first, each
 * with an invite to apply (client rollout 2026-10-27: "Suitable profiles for
 * jobs to notify (Email) — option is not in detailed job view"). Candidates
 * who already applied are on the Applications tab instead. When no one fits,
 * the way out is adding the skills the job needs.
 */
export default function JobMatchesTabPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("employerJobWorkspace");
  const tm = useTranslations("agentJobMatches");
  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>{t("matchesHeading")}</h2>
      <JobMatches
        jobId={id}
        role="employer"
        applicantsHref={`/${locale}/employer/jobs/${id}/applications`}
        emptyAction={
          <Link href={`/${locale}/employer/jobs/${id}/edit`}>
            <Button variant="outline" className="min-h-11 rounded-xl">{tm("employer.addSkills")}</Button>
          </Link>
        }
      />
    </>
  );
}
