import type { ReactNode } from "react";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

// matching-weights/page.tsx is a Client Component, so the guard lives here
// instead of inline (auth() cannot run in a "use client" file).
export default async function MatchingWeightsLayout({ children }: { children: ReactNode }) {
  await requireCompanyFunction("canViewAnalytics");
  return children;
}
