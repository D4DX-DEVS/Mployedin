import { DataPrivacyPage } from "@/components/features/privacy/DataPrivacyPage";

// Not under /employer/settings: that layout requires canManageCompanySettings,
// and a team member's own data rights don't depend on company permissions.
export default function EmployerPrivacyPage() {
  return <DataPrivacyPage variant="workspace" />;
}
