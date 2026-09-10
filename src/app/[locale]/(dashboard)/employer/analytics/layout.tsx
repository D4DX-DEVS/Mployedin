import type { ReactNode } from "react";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

// analytics/page.tsx is a Client Component, so the guard lives here
// instead of inline (auth() cannot run in a "use client" file).
export default async function AnalyticsLayout({ children }: { children: ReactNode }) {
  await requireCompanyFunction("canViewAnalytics");
  return children;
}
