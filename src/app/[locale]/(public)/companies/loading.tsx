export default function CompaniesLoading() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="h-8 w-44 rounded-lg bg-muted mb-2" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-8 flex-wrap">
        <div className="h-10 flex-1 min-w-[200px] rounded-lg bg-muted" />
        <div className="h-10 w-[200px] rounded-lg bg-muted" />
        <div className="h-10 w-24 rounded-lg bg-muted" />
      </div>

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl panel-body">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg bg-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-5 w-3/4 rounded bg-muted mb-2" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
