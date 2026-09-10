import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";
import TeamManagementPage from "./TeamManagementPageClient";

// This route is a thin server wrapper rather than a sibling layout.tsx guard
// because `employer/team/` also contains `team/accept/`, the invite-acceptance
// page a newly-invited (not-yet-permissioned) colleague must still be able to
// open. A layout.tsx at this directory would wrap that route too and lock
// invitees out of accepting their own invite.
export default async function Page() {
  await requireCompanyFunction("canManageTeam");
  return <TeamManagementPage />;
}
