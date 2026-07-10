import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/requireRole";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ["admin"]);
  return children;
}
