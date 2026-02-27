import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getDashboardPath } from "@/lib/permissions/matrix";
import type { UserRole } from "@/models/User";

export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: paramsLocale } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${paramsLocale}/login`);
  }

  const role = (session.user as { role: UserRole }).role;
  // Use URL locale so language choice is respected
  redirect(getDashboardPath(role, paramsLocale));
}
