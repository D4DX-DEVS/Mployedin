import { SuperAgentJobMatches } from "@/components/features/super-agent/SuperAgentJobMatches";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/** Candidates in the database ranked for one job in the super agent's book. */
export default async function SuperAgentJobMatchesPage({ params }: PageProps) {
  const { locale, id } = await params;
  return <SuperAgentJobMatches locale={locale} jobId={id} />;
}
