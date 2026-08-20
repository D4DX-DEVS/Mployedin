export default function PreferencesLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-lg bg-muted" />
        <div className="h-4 w-64 rounded bg-muted/70" />
      </div>
      <div className="card-base space-y-5 panel-body">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-28 rounded bg-muted/60" />
            <div className="h-10 w-full rounded-xl bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
