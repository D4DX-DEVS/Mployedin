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
          className={`rounded-lg border border-border bg-card p-4 sm:p-5 ${itemHeight} animate-pulse`}
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}
