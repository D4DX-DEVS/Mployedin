import { SettingsHubShell } from "@/components/features/job-seeker/SettingsHubShell";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";
import { ChangePasswordCard } from "@/components/features/settings/ChangePasswordCard";
import { ConnectedAppsCard } from "@/components/features/settings/ConnectedAppsCard";

/**
 * Settings › Account: sign-in email, password and connected apps. These sat
 * under a "Profile Visibility" tab before, beside a salary form nothing read.
 */
export default async function SeekerAccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <SettingsHubShell locale={locale}>
      <div className="space-y-5">
        <ChangeEmailCard />
        <ChangePasswordCard />
        <ConnectedAppsCard />
      </div>
    </SettingsHubShell>
  );
}
