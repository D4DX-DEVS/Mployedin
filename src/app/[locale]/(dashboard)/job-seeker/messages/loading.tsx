export default function MessagesLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-lg bg-muted" />
        <div className="h-4 w-52 rounded bg-muted/70" />
      </div>
      <div className="flex h-[60vh] overflow-hidden rounded-2xl border border-border bg-card">
        {/* Sidebar */}
        <div className="w-72 border-r border-border p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted/60 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-muted/60" />
                <div className="h-3 w-36 rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
        {/* Chat area */}
        <div className="flex-1 p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
              <div className="h-10 w-48 rounded-2xl bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
