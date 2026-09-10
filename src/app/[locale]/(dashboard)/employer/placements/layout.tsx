import type { ReactNode } from "react";
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";

// placements/page.tsx is a Client Component, so the guard lives here
// instead of inline (auth() cannot run in a "use client" file). This also
// covers placements/[id] and placements/[id]/onboarding, which are nested
// under this directory and belong to the same gated feature.
export default async function PlacementsLayout({ children }: { children: ReactNode }) {
  await requireCompanyFunction("canOnboardPlacements");
  return children;
}
