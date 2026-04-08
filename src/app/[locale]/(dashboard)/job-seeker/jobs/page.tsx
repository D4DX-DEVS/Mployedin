import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { JobFeedPage } from "@/components/features/job-seeker/feed/JobFeedPage";

export default async function JobSeekerJobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  return <JobFeedPage locale={locale} />;
}
