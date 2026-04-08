import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { JobSeekerHomePage } from "@/components/features/job-seeker/home/JobSeekerHomePage";

export default async function JobSeekerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  return <JobSeekerHomePage locale={locale} />;
}
