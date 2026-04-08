export default function MessagesLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="mb-6">
        <div className="h-7 w-32 bg-muted/60 rounded-md animate-pulse" />
        <div className="h-4 w-44 bg-muted/40 rounded-md animate-pulse mt-2" />
      </div>
      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* Conversation list skeleton */}
        <div className="w-80 rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="h-9 w-full bg-muted/40 rounded-md animate-pulse mb-3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-md animate-pulse"
              style={{ opacity: 1 - i * 0.12 }}
            >
              <div className="w-10 h-10 rounded-full bg-muted/50 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 bg-muted/50 rounded" />
                <div className="h-3 w-40 bg-muted/30 rounded" />
              </div>
            </div>
          ))}
        </div>
        {/* Chat area skeleton */}
        <div className="flex-1 rounded-lg border border-border bg-card animate-pulse" />
      </div>
    </div>
  );
}
