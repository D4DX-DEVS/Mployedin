import { DataPrivacyPage } from "@/components/features/privacy/DataPrivacyPage";
import { mayUseCompanyFunction } from "@/lib/auth/requireCompanyFunction";

// Not under /employer/settings: that layout requires canManageCompanySettings,
// and a team member's own data rights don't depend on company permissions.
// The link to notification settings shows only to those who can open them.
export default async function EmployerPrivacyPage() {
  const canOpenSettings = await mayUseCompanyFunction("canManageCompanySettings");
  return (
    <DataPrivacyPage
      variant="workspace"
      notificationsHref={canOpenSettings ? "/employer/settings?tab=notifications" : undefined}
    />
  );
}
