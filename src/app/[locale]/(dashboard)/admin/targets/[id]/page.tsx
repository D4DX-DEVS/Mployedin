import { redirect } from "next/navigation";
import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

interface AdminLegacyTargetDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminLegacyTargetDetailPage({
  params,
  searchParams,
}: AdminLegacyTargetDetailPageProps) {
  const { locale } = await params;
  redirect(getLegacyTargetRedirectPath(locale, "admin", await searchParams));
}