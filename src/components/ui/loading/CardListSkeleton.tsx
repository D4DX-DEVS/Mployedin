interface CardListSkeletonProps {
  count?: number;
  itemHeight?: string;
}

export function CardListSkeleton({ count = 5, itemHeight = "h-24" }: CardListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`rounded-lg border border-border bg-card ${itemHeight} animate-pulse panel-body`}
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}
