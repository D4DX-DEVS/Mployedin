"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { InterviewsWorkspace } from "@/components/features/employer/interviews/InterviewsWorkspace";

/** Interviews tab: the shared workspace pinned to this job (no job selector). */
export default function JobInterviewsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("employerJobWorkspace");
  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>{t("interviewsHeading")}</h2>
      <InterviewsWorkspace jobId={id} embedded />
    </>
  );
}
