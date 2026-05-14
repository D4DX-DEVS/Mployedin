import { redirect } from "next/navigation";
import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

interface AdminLegacyTargetsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminLegacyTargetsPage({
  params,
  searchParams,
}: AdminLegacyTargetsPageProps) {
  const { locale } = await params;
  redirect(getLegacyTargetRedirectPath(locale, "admin", await searchParams));
}