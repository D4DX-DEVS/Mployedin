import type { ReactNode } from "react";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

// candidates/page.tsx is a Client Component, so the guard lives here
// instead of inline (auth() cannot run in a "use client" file). This also
// covers candidates/[id], nested under this directory and part of the same
// gated feature.
export default async function CandidatesLayout({ children }: { children: ReactNode }) {
  await requireCompanyFunction("canReviewApplicants");
  return children;
}
