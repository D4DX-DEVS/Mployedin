import { notFound } from "next/navigation";
import { MyPostersPage } from "@/components/features/employer/poster/MyPostersPage";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";

export default async function Page() {
  if (!POSTERS_ENABLED) notFound();
  await requireCompanyFunction("canManageTalentPools");
  return <MyPostersPage />;
}
