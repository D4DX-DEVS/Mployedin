import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/requireRole";

export default async function AgentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ["agent", "admin"]);
  return children;
}
