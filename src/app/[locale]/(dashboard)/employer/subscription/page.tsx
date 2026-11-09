import { getTranslations } from "next-intl/server";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { PlanBillingView } from "@/components/subscription/PlanBillingView";

/** Employer Plan & billing. The canManageBilling guard lives in layout.tsx. */
export default async function EmployerSubscriptionPage() {
  const t = await getTranslations("planBilling");
  return (
    <div className="page-container">
      <WorkspaceHeader title={t("title")} context={<span className="hidden sm:inline">{t("description")}</span>} />
      <PlanBillingView role="employer" />
    </div>
  );
}
