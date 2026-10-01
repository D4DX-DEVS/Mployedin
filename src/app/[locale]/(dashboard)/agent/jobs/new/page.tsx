import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";
import { NewJobChooser } from "@/components/features/employer/jobs/NewJobChooser";
import { TemplatePicker } from "@/components/features/employer/jobs/TemplatePicker";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ employer?: string; mode?: string; prefill?: string; from?: string }>;
}

/**
 * Agents post jobs the way employers do: the same four ways in (AI creator,
 * the five-step form, a saved template, an uploaded document), for one of the
 * employers assigned to them. The start screen asks for that employer first
 * and every flow carries it on as `?employer=` — sent already by the Post job
 * button on an employer card.
 */
export default async function AgentNewJobPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { employer, mode, prefill, from } = await searchParams;
  const employerId = employer && /^[a-f0-9]{24}$/i.test(employer) ? employer : undefined;

  if (mode === "manual") {
    return <JobFormWizard locale={locale} basePath="agent" initialEmployerId={employerId} useAiPrefill={prefill === "ai"} />;
  }

  if (from === "template" && employerId) {
    return <TemplatePicker locale={locale} basePath="agent" employerId={employerId} />;
  }

  return <NewJobChooser locale={locale} basePath="agent" employerId={employerId} />;
}
