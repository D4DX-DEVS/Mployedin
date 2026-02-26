import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getNavGroups, getAllNavItems } from "@/lib/nav/menuConfig";
import { DashboardShell } from "@/components/shared/DashboardShell";
import type { UserRole } from "@/models/User";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const session = await auth();
  const { locale: paramLocale } = await params;
  if (!session?.user) {
    redirect(`/${paramLocale}/login`);
  }

  const role = (session.user as { role: UserRole }).role;
  const locale = (session.user as { locale: string }).locale ?? paramLocale;

  const navGroups = getNavGroups(role, locale);
  const allItems = getAllNavItems(role, locale);

  return (
    <DashboardShell
      navGroups={navGroups}
      allItems={allItems}
      locale={locale}
      userName={session.user.name ?? undefined}
    >
      {children}
    </DashboardShell>
  );
}
