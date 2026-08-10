import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { SavedJobsPage } from "@/components/features/job-seeker/saved-jobs/SavedJobsPage";

export default async function JobSeekerSavedJobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  return <SavedJobsPage locale={locale} />;
}
