export default function JobsLoading() {
  return (
    <div className="min-h-screen bg-background animate-pulse">
      {/* Hero search bar */}
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="h-7 w-48 rounded-lg bg-muted mb-2" />
          <div className="h-4 w-64 rounded bg-muted mb-6" />
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="h-10 flex-1 rounded-lg bg-muted" />
            <div className="h-10 sm:w-48 rounded-lg bg-muted" />
            <div className="h-10 w-24 rounded-lg bg-muted" />
          </div>
        </div>
      </div>

      {/* Job list */}
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5">
            <div className="h-5 w-1/2 rounded bg-muted mb-2" />
            <div className="h-4 w-32 rounded bg-muted mb-3" />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-5 w-14 rounded-md bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
