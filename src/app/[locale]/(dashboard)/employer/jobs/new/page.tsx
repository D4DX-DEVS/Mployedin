import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";
import { NewJobChooser } from "@/components/features/employer/jobs/NewJobChooser";
import { TemplatePicker } from "@/components/features/employer/jobs/TemplatePicker";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string; prefill?: string; from?: string }>;
}

export default async function NewJobPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { mode, prefill, from } = await searchParams;

  if (mode === "manual") {
    return <JobFormWizard locale={locale} useAiPrefill={prefill === "ai"} />;
  }

  if (from === "template") {
    return <TemplatePicker locale={locale} />;
  }

  // Bare path: the four-way chooser (workspace spec §3.10, decision 6). The AI
  // creator, the form, the template picker and document upload each keep
  // their own deep link, so nothing that pointed at them changes.
  return <NewJobChooser locale={locale} />;
}
