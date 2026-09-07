import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The wizard is the page.
 *
 * This used to wrap it in a second `page-container` and its own `PageHeader`.
 * Both are already inside `JobFormWizard` (it is mounted standalone on
 * employer/jobs/new), so admin paid the gutter twice — 32px of padding a side
 * on a 390px phone before the wizard's own card padding — and printed two
 * titles, "Post a Job (Admin)" over "Post a New Job", that said the same thing.
 * The employer context the extra header carried is already in the wizard: the
 * admin build renders an Employer picker the employer build does not.
 */
export default async function AdminNewJobPage({ params }: PageProps) {
  const { locale } = await params;
  return <JobFormWizard locale={locale} basePath="admin" />;
}
