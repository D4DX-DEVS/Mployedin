import { PageHeaderSkeleton, KpiGridSkeleton, ChartSkeleton } from "@/components/ui/loading";

export default function InsightsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton showButton={false} />
      <KpiGridSkeleton count={4} />
      <ChartSkeleton />
    </div>
  );
}
