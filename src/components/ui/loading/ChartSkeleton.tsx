import { Skeleton } from "@/components/ui/skeleton";

interface ChartSkeletonProps {
  height?: string;
  bars?: number;
}

export function ChartSkeleton({ height = "h-64", bars = 7 }: ChartSkeletonProps) {
  const heights = ["h-1/3", "h-2/3", "h-1/2", "h-full", "h-3/4", "h-1/2", "h-2/5"];

  return (
    <div className="card-base space-y-4 panel-body">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32 bg-muted/50" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-14 bg-muted/40" />
          <Skeleton className="h-6 w-14 bg-muted/40" />
        </div>
      </div>
      <div className={`flex items-end gap-3 ${height}`}>
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full">
            <div
              className={`w-full rounded-t-md bg-muted animate-pulse ${heights[i % heights.length]}`}
              style={{ opacity: 1 - (i % heights.length) * 0.05 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
