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
      <div className="h-full min-h-[240px] animate-pulse rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]" />
    ),
  }
);
