interface CardGridSkeletonProps {
  count?: number;
  itemHeight?: string;
  cols?: string;
}

export function CardGridSkeleton({
  count = 6,
  itemHeight = "h-40",
  cols = "sm:grid-cols-2 lg:grid-cols-3",
}: CardGridSkeletonProps) {
  return (
    <div className={`grid grid-cols-1 ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`rounded-lg border border-border bg-card ${itemHeight} animate-pulse panel-body`}
          style={{ opacity: 1 - (i % 6) * 0.08 }}
        />
      ))}
    </div>
  );
}
