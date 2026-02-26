export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* PageHeader skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-base space-y-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-8 w-16 rounded bg-muted" />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="card-base space-y-3">
        <div className="h-5 w-32 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center py-1">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-4 flex-1 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
