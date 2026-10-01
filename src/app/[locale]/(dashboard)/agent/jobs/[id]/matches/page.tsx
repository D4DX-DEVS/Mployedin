import { JobMatchesWorkspace } from "./_components/JobMatchesWorkspace";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/** Candidates in the database ranked for one job — the agent's sourcing view. */
export default async function AgentJobMatchesPage({ params }: PageProps) {
  const { locale, id } = await params;
  return <JobMatchesWorkspace locale={locale} jobId={id} />;
}
