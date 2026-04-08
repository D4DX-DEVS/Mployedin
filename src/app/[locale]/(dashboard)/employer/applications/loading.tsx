export default function ApplicationsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-40 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-28 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-muted/50 rounded-md animate-pulse" />
          <div className="h-9 w-20 bg-muted/50 rounded-md animate-pulse" />
        </div>
      </div>
      {/* Pipeline stage headers skeleton */}
      <div className="flex gap-3 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 flex-1 bg-muted/40 rounded-md animate-pulse" />
        ))}
      </div>
      {/* Table rows skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 h-16 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
        ))}
      </div>
    </div>
  );
}
