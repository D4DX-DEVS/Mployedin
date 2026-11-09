import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlanBillingView } from "@/components/subscription/PlanBillingView";

/** Job-seeker Plan & billing. */
export default async function JobSeekerSubscriptionPage() {
  const t = await getTranslations("planBilling");
  return (
    <div className="page-container">
      <PageHeader title={t("title")} description={t("description")} backHref="/job-seeker" />
      <PlanBillingView role="job_seeker" />
    </div>
  );
}
