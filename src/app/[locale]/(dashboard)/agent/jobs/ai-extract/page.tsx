import { redirect } from "next/navigation";
import AIJobExtractPage from "@/app/[locale]/(dashboard)/employer/jobs/ai-extract/page";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ employer?: string }>;
}

/**
 * The employer's page, for an agent posting on an assigned employer's behalf:
 * upload a job poster or document for AI extraction. The employer comes from the start screen
 * (`?employer=`); without one there is nobody to post for, so go pick one.
 */
export default async function AgentAIJobExtractPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { employer } = await searchParams;
  if (!employer || !/^[a-f0-9]{24}$/i.test(employer)) redirect(`/${locale}/agent/jobs/new`);
  return <AIJobExtractPage />;
}
