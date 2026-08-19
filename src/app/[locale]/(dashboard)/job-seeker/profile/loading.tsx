export default function ProfileLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-lg bg-muted" />
        <div className="h-4 w-60 rounded bg-muted/70" />
      </div>
      {/* Profile header */}
      <div className="card-base flex items-center gap-5 p-6">
        <div className="h-20 w-20 rounded-full bg-muted/60 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 rounded-lg bg-muted" />
          <div className="h-4 w-56 rounded bg-muted/60" />
          <div className="h-3 w-72 rounded bg-muted/40" />
        </div>
      </div>
      {/* Sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card-base space-y-3 p-6">
          <div className="h-5 w-32 rounded-lg bg-muted" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="h-10 rounded-xl bg-muted/40" />
          ))}
        </div>
      ))}
    </div>
  );
}
