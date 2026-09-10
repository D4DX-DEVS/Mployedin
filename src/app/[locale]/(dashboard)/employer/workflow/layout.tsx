import type { ReactNode } from "react";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

// workflow/page.tsx is a Client Component, so the guard lives here
// instead of inline (auth() cannot run in a "use client" file).
export default async function WorkflowLayout({ children }: { children: ReactNode }) {
  await requireCompanyFunction("canOnboardPlacements");
  return children;
}
