export default function WorkflowLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-36 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-52 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-9 w-28 bg-muted/50 rounded-md animate-pulse" />
      </div>
      <div className="rounded-lg border border-border bg-card space-y-4 panel-body">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted/50 animate-pulse shrink-0" />
            <div className="h-12 flex-1 bg-muted/30 rounded-md animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
