import { redirect } from "next/navigation";
import EmployerAIJobCreatePage from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/page";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ employer?: string }>;
}

/**
 * The employer's page, for an agent posting on an assigned employer's behalf:
 * describe the role to the AI job creator. The employer comes from the start screen
 * (`?employer=`); without one there is nobody to post for, so go pick one.
 */
export default async function AgentAIJobCreatePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { employer } = await searchParams;
  if (!employer || !/^[a-f0-9]{24}$/i.test(employer)) redirect(`/${locale}/agent/jobs/new`);
  return <EmployerAIJobCreatePage />;
}
