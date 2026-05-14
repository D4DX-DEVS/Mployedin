import { redirect } from "next/navigation";
import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

interface AgentLegacyTargetsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgentLegacyTargetsPage({
  params,
  searchParams,
}: AgentLegacyTargetsPageProps) {
  const { locale } = await params;
  redirect(getLegacyTargetRedirectPath(locale, "agent", await searchParams));
}