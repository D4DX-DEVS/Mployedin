import { redirect } from "next/navigation";
import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

interface SuperAgentLegacyTargetsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SuperAgentLegacyTargetsPage({
  params,
  searchParams,
}: SuperAgentLegacyTargetsPageProps) {
  const { locale } = await params;
  redirect(getLegacyTargetRedirectPath(locale, "super-agent", await searchParams));
}