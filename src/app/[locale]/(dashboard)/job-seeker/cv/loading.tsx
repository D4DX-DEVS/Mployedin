export default function CvLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 rounded-lg bg-muted" />
        <div className="h-4 w-56 rounded bg-muted/70" />
      </div>
      <div className="card-base space-y-4 panel-body">
        <div className="h-40 w-full rounded-xl bg-muted/50" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-muted/60" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}
