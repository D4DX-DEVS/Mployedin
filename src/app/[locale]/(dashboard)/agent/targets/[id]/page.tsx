import { redirect } from "next/navigation";
import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

interface AgentLegacyTargetDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgentLegacyTargetDetailPage({
  params,
  searchParams,
}: AgentLegacyTargetDetailPageProps) {
  const { locale } = await params;
  redirect(getLegacyTargetRedirectPath(locale, "agent", await searchParams));
}