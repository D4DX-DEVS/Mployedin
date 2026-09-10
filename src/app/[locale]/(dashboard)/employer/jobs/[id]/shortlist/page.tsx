"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApplicationsWorkspace } from "@/components/features/employer/applications/ApplicationsWorkspace";

/**
 * Shortlist tab: the stage between Applications and Interviews.
 *
 * Locked to "shortlisted or further on" — advancing a candidate to Interviewing
 * does not unpick them from the shortlist, so a list of only those parked at
 * `shortlisted` would lose people as they progress and disagree with the tab's
 * own count.
 */
export default function JobShortlistPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("employerJobWorkspace");
  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>{t("shortlistHeading")}</h2>
      <ApplicationsWorkspace jobId={id} embedded stageLock="shortlisted" />
    </>
  );
}
