import { redirect } from "next/navigation";
import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

interface SuperAgentLegacyTargetDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SuperAgentLegacyTargetDetailPage({
  params,
  searchParams,
}: SuperAgentLegacyTargetDetailPageProps) {
  const { locale } = await params;
  redirect(getLegacyTargetRedirectPath(locale, "super-agent", await searchParams));
}