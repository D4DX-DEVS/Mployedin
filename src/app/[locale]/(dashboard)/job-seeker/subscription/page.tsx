import { SettingsHubShell } from "@/components/features/job-seeker/SettingsHubShell";
import { PlanBillingView } from "@/components/subscription/PlanBillingView";

/** Settings › Plan & billing for the job seeker. */
export default async function JobSeekerSubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <SettingsHubShell locale={locale}>
      <PlanBillingView role="job_seeker" />
    </SettingsHubShell>
  );
}
