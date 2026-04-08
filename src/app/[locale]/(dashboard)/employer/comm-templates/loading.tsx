export default function CommTemplatesLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-44 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-56 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-9 w-36 bg-muted/50 rounded-md animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-5 h-36 animate-pulse"
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}
