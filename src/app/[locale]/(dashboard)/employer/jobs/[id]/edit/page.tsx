"use client";

import { useParams } from "next/navigation";
import { SharedJobEditPage } from "@/components/features/jobs/SharedJobEditPage";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";
import { useJobDetail } from "@/hooks/useJobs";

export default function EmployerJobEditRoute() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const jobHref = `/${locale}/employer/jobs/${id}`;
  // Shares the detail query (and cache) SharedJobEditPage uses.
  const { data: job } = useJobDetail(id);

  // EMP-21: a draft is still being written, so it reopens in the same 5-step
  // wizard it was started in (on the review step). Published jobs keep the
  // single-page editor, whose primary action is "Save changes".
  if ((job as { status?: string } | undefined)?.status === "draft") {
    return <JobFormWizard locale={locale} resumeJobId={id} />;
  }

  return (
    <SharedJobEditPage
      id={id}
      backHref={jobHref}
      afterSaveHref={jobHref}
    />
  );
}
