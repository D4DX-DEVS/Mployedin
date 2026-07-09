import { cn } from "@/lib/utils";

interface ListSkeletonProps {
  count?: number;
  layout?: "list" | "grid";
  itemClassName?: string;
  className?: string;
}

export function ListSkeleton({
  count = 5,
  layout = "list",
  itemClassName,
  className,
}: ListSkeletonProps) {
  return (
    <div
      className={cn(
        layout === "grid"
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "space-y-3",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-20 animate-pulse rounded-2xl border border-border/60 bg-muted/40",
            itemClassName
          )}
        />
      ))}
    </div>
  );
}
