interface KpiGridSkeletonProps {
  count?: number;
  cols?: 2 | 4;
}

export function KpiGridSkeleton({ count = 4, cols = 4 }: KpiGridSkeletonProps) {
  const gridClass = cols === 2
    ? "grid grid-cols-2 gap-4 mb-6"
    : "grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6";

  return (
    <div className={gridClass}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-base space-y-3 animate-pulse">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-8 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
