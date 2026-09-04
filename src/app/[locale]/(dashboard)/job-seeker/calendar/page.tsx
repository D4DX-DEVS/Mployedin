import { redirect } from "next/navigation";

export default async function JobSeekerCalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/job-seeker/interviews?view=calendar`);
}
