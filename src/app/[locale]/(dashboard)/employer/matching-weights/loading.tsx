export default function MatchingWeightsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="mb-6">
        <div className="h-7 w-44 bg-muted/60 rounded-md animate-pulse" />
        <div className="h-4 w-64 bg-muted/40 rounded-md animate-pulse mt-2" />
      </div>
      <div className="rounded-lg border border-border bg-card space-y-5 panel-body">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-32 bg-muted/50 rounded-md animate-pulse shrink-0" />
            <div className="h-3 flex-1 bg-muted/30 rounded-full animate-pulse" />
            <div className="h-5 w-10 bg-muted/50 rounded-md animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
