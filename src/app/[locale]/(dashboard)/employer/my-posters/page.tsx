import { MyPostersPage } from "@/components/features/employer/poster/MyPostersPage";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

export default async function Page() {
  await requireCompanyFunction("canManageTalentPools");
  return <MyPostersPage />;
}
