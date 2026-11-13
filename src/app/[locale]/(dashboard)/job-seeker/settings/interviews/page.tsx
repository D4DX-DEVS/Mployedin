import { SettingsHubShell } from "@/components/features/job-seeker/SettingsHubShell";
import { InterviewAvailabilityForm } from "../_components/InterviewAvailabilityForm";

/** Settings › Interview availability: when employers can book interviews. */
export default async function SeekerInterviewAvailabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <SettingsHubShell locale={locale}>
      <InterviewAvailabilityForm />
    </SettingsHubShell>
  );
}
