export default function JobDetailLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-24 rounded bg-muted mb-6" />

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-3">
            <div className="h-7 w-3/4 rounded-lg bg-muted" />
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="flex flex-wrap gap-3">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`h-4 rounded bg-muted ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
            ))}
          </div>
        </div>

        {/* Sidebar apply box */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl space-y-4 panel-body">
            <div className="h-10 w-full rounded-lg bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
