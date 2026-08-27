export default function AnalyticsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-36 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-48 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-9 w-24 bg-muted/50 rounded-md animate-pulse" />
      </div>
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card h-24 animate-pulse card-pad" />
        ))}
      </div>
      {/* Tab bar skeleton */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-muted/40 rounded-md animate-pulse" />
        ))}
      </div>
      {/* Chart area skeleton */}
      <div className="rounded-lg border border-border bg-card h-80 animate-pulse panel-body" />
    </div>
  );
}
