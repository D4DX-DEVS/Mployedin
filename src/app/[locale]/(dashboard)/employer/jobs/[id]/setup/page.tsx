"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { WorkspaceTabs } from "@/components/shared/WorkspaceTabs";
import { JobWorkflowTab } from "@/components/features/employer/jobs/JobWorkflowTab";
import { JobMatchingWeightsTab } from "@/components/features/employer/jobs/JobMatchingWeightsTab";

type Section = "workflow" | "weights";

/** Setup tab: per-job hiring workflow and matching weights (`?section=`). */
export default function JobSetupPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations("employerJobWorkspace");
  const section: Section = searchParams.get("section") === "weights" ? "weights" : "workflow";
  const base = `/${locale}/employer/jobs/${id}/setup`;

  return (
    <section aria-labelledby="job-setup-heading" className="space-y-3 sm:space-y-4">
      <h2 id="job-setup-heading" className="sr-only">{t("setupHeading")}</h2>
      <WorkspaceTabs
        ariaLabel={t("setupSectionsLabel")}
        activeKey={section}
        tabs={[
          { key: "workflow", label: t("setupWorkflow"), href: `${base}?section=workflow` },
          { key: "weights", label: t("setupWeights"), href: `${base}?section=weights` },
        ]}
      />
      {section === "workflow" ? <JobWorkflowTab jobId={id} /> : <JobMatchingWeightsTab jobId={id} />}
    </section>
  );
}
