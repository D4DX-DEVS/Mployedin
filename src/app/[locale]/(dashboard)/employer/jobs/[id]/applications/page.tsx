"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApplicationsWorkspace } from "@/components/features/employer/applications/ApplicationsWorkspace";

/** Applications tab: the shared inbox pinned to this job (no job selector). */
export default function JobApplicationsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("employerJobWorkspace");
  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>{t("applicationsHeading")}</h2>
      <ApplicationsWorkspace jobId={id} embedded />
    </>
  );
}
