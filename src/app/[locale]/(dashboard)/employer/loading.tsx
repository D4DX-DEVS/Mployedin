export default function EmployerLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-48 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-32 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-9 w-28 bg-muted/50 rounded-md animate-pulse" />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-9 w-64 bg-muted/40 rounded-md animate-pulse" />
        <div className="h-9 w-44 bg-muted/40 rounded-md animate-pulse" />
      </div>

      {/* Content skeleton — 5 card rows */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4 sm:p-5 h-24 animate-pulse"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
