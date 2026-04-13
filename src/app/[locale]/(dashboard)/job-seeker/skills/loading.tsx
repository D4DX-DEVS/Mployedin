export default function SkillsLoading() {
  return (
    <div className="page-container space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 rounded-lg bg-muted" />
        <div className="h-4 w-56 rounded bg-muted/70" />
      </div>
      <div className="card-base p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-muted/50" />
          ))}
        </div>
        <div className="h-px bg-border" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded-xl bg-muted/40" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}
