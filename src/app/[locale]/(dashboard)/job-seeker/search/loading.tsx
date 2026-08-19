export default function SearchLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-lg bg-muted" />
        <div className="h-4 w-60 rounded bg-muted/70" />
      </div>
      <div className="h-12 w-full rounded-2xl bg-muted/50" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-2xl border border-border bg-card"
            style={{ opacity: 1 - i * 0.07 }}
          />
        ))}
      </div>
    </div>
  );
}
