import { OffersWorkspace } from "@/components/features/employer/offers/OffersWorkspace";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

export default async function EmployerOffersPage() {
  await requireCompanyFunction("canSendOffers");
  return <OffersWorkspace />;
}
