import { ApplicationsWorkspace } from "@/components/features/employer/applications/ApplicationsWorkspace";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

export default async function EmployerApplicationsPage() {
  await requireCompanyFunction("canReviewApplicants");
  return <ApplicationsWorkspace />;
}
