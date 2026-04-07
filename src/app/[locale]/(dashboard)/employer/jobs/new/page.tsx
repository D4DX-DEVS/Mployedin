import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewJobPage({ params }: PageProps) {
  const { locale } = await params;
  return <JobFormWizard locale={locale} />;
}
