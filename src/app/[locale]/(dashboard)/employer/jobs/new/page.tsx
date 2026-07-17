import { redirect } from "next/navigation";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string; prefill?: string }>;
}

export default async function NewJobPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { mode, prefill } = await searchParams;

  if (mode === "manual") {
    return <JobFormWizard locale={locale} useAiPrefill={prefill === "ai"} />;
  }

  // The standalone "choose how to post" page is retired — the AI Job Creator is the single
  // entry point (it links to the manual form and poster upload itself). ?mode=manual still
  // opens the form directly for anything that deep-links to it.
  redirect(`/${locale}/employer/jobs/ai-create`);
}
