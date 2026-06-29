interface TableRowsSkeletonProps {
  rows?: number;
  cols?: number;
}

export function TableRowsSkeleton({ rows = 8, cols = 5 }: TableRowsSkeletonProps) {
  const colWidths = ["w-8", "flex-1", "w-28", "w-20", "w-16"];

  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 items-center px-4 py-3 rounded-md border border-border bg-card animate-pulse"
          style={{ opacity: 1 - i * 0.08 }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className={`h-4 rounded bg-muted ${colWidths[j] ?? "w-20"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
