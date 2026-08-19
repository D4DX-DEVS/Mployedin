import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminNewJobPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("adminJobsNew");

  return (
    <div className="page-container">
      <PageHeader
        title={t("postJobAdmin")}
        description={t("createJobPostingDescription")}
      />
      <JobFormWizard locale={locale} basePath="admin" />
    </div>
  );
}
