import { SettingsHubShell } from "@/components/features/job-seeker/SettingsHubShell";
import { DataPrivacyPanel } from "@/components/features/privacy/DataPrivacyPanel";

/**
 * Settings › Privacy & data. The one place a seeker turns discoverability on or
 * off — the profile banner links here instead of opening its own copy.
 */
export default async function JobSeekerPrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <SettingsHubShell locale={locale}>
      <DataPrivacyPanel seeker notificationsHref="/job-seeker/settings/notifications" />
    </SettingsHubShell>
  );
}
