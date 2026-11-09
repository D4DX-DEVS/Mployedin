import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";
import { redirect } from "next/navigation";
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

  // Bare path opens the AI creator directly. It links to the manual form and
  // takes document uploads (AI Scan); templates stay on the Create menu / ⌘K
  // (?from=template), so every way in is still one step away.
  redirect(`/${locale}/employer/jobs/ai-create`);
}
