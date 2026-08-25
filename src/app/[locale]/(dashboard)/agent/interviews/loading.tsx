export default function AgentInterviewsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-36 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-48 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-9 w-36 bg-muted/50 rounded-md animate-pulse" />
      </div>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-9 w-64 bg-muted/40 rounded-md animate-pulse" />
        <div className="h-9 w-32 bg-muted/40 rounded-md animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card h-24 animate-pulse panel-body"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
