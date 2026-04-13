export default function JobsLoading() {
  return (
    <div className="page-container space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-lg bg-muted" />
        <div className="h-4 w-56 rounded bg-muted/70" />
      </div>
      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        <div className="h-10 flex-1 max-w-xs rounded-xl bg-muted/50" />
        <div className="h-10 w-32 rounded-xl bg-muted/50" />
        <div className="h-10 w-32 rounded-xl bg-muted/50" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-48 rounded-2xl border border-border bg-card"
            style={{ opacity: 1 - i * 0.07 }}
          />
        ))}
      </div>
    </div>
  );
}
