import { PageHeaderSkeleton } from "./PageHeaderSkeleton";
import { KpiGridSkeleton } from "./KpiGridSkeleton";
import { CardListSkeleton } from "./CardListSkeleton";

interface DashboardPageSkeletonProps {
  kpiCount?: number;
  rowCount?: number;
  showButton?: boolean;
}

export function DashboardPageSkeleton({
  kpiCount = 4,
  rowCount = 5,
  showButton = true,
}: DashboardPageSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-hidden="true"
      className="page-container animate-in fade-in duration-300"
    >
      <PageHeaderSkeleton showButton={showButton} />
      <KpiGridSkeleton count={kpiCount} />
      <CardListSkeleton count={rowCount} />
    </div>
  );
}
