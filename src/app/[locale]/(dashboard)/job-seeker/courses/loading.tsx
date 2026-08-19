export default function CoursesLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-lg bg-muted" />
        <div className="h-4 w-60 rounded bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-52 rounded-2xl border border-border bg-card"
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}
