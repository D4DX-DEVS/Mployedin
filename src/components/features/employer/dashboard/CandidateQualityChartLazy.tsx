"use client";

import dynamic from "next/dynamic";

export const CandidateQualityChartLazy = dynamic(
  () =>
    import("@/components/features/employer/dashboard/CandidateQualityChart").then(
      (m) => m.CandidateQualityChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[200px] animate-pulse rounded-2xl bg-muted/50" />
    ),
  }
);
