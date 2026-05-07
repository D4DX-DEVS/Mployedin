import { PageHeader } from "@/components/shared/PageHeader";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminNewJobPage({ params }: PageProps) {
  const { locale } = await params;

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Post a Job (Admin)"
        description="Create a job posting on behalf of an employer."
      />
      <JobFormWizard locale={locale} />
    </div>
  );
}
