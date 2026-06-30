export default function CompanyDetailLoading() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl animate-pulse">
      {/* Company header */}
      <div className="flex items-start gap-5 mb-8">
        <div className="w-20 h-20 rounded-xl bg-muted shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-7 w-1/2 rounded-lg bg-muted" />
          <div className="flex flex-wrap gap-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* About */}
      <div className="space-y-2 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-4 rounded bg-muted ${i === 2 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>

      {/* Open jobs */}
      <div className="h-5 w-32 rounded bg-muted mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5">
            <div className="h-5 w-1/2 rounded bg-muted mb-2" />
            <div className="flex flex-wrap gap-3">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
