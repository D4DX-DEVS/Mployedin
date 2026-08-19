export default function DocumentsLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-lg bg-muted" />
        <div className="h-4 w-60 rounded bg-muted/70" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-xl border border-border bg-card"
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}
