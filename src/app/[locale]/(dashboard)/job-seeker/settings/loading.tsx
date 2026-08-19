export default function SettingsLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-lg bg-muted" />
        <div className="h-4 w-60 rounded bg-muted/70" />
      </div>
      <div className="flex gap-4">
        {/* Sidebar nav */}
        <div className="w-52 shrink-0 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-muted/40" />
          ))}
        </div>
        {/* Content area */}
        <div className="flex-1 card-base space-y-4 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3.5 w-28 rounded bg-muted/60" />
              <div className="h-10 w-full rounded-xl bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
