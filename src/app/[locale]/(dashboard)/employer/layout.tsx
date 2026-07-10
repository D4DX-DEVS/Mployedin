import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/requireRole";

export default async function EmployerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Tenant view: agents/super-agents with a middleware-verified tenant cookie
  // may access the employer workspace.
  await requireRole(locale, ["employer", "admin"], { allowTenantView: true });
  return children;
}
