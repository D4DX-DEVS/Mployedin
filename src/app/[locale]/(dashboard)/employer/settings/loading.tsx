export default function SettingsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="mb-6">
        <div className="h-7 w-32 bg-muted/60 rounded-md animate-pulse" />
        <div className="h-4 w-56 bg-muted/40 rounded-md animate-pulse mt-2" />
      </div>
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-32 bg-muted/40 rounded-md animate-pulse" />
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card space-y-6 panel-body">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-muted/50 rounded-md animate-pulse" />
            <div className="h-10 w-full bg-muted/30 rounded-md animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
