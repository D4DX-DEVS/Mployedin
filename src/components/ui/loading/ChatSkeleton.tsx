interface ChatSkeletonProps {
  conversations?: number;
}

export function ChatSkeleton({ conversations = 6 }: ChatSkeletonProps) {
  return (
    <div className="flex h-[calc(100vh-12rem)] rounded-lg border border-border overflow-hidden">
      <div className="w-full max-w-xs border-r border-border p-3 space-y-3 hidden sm:block">
        <div className="h-9 w-full rounded-md bg-muted/40 animate-pulse" />
        {Array.from({ length: conversations }).map((_, i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.1 }}>
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted/60 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 flex flex-col justify-end gap-3 p-4">
        {[1, 0, 1, 1, 0].map((fromMe, i) => (
          <div key={i} className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
            <div
              className="h-10 rounded-2xl bg-muted animate-pulse"
              style={{ width: `${35 + (i % 3) * 15}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
