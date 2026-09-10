import { InterviewsWorkspace } from "@/components/features/employer/interviews/InterviewsWorkspace";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

export default async function EmployerInterviewsPage() {
  await requireCompanyFunction("canScheduleInterviews");
  return <InterviewsWorkspace />;
}
