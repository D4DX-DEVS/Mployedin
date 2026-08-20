import { Skeleton } from "@/components/ui/skeleton";

interface CalendarSkeletonProps {
  cells?: number;
}

export function CalendarSkeleton({ cells = 35 }: CalendarSkeletonProps) {
  return (
    <div className="card-base space-y-4 panel-body">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40 bg-muted/60" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 bg-muted/40 rounded-md" />
          <Skeleton className="h-8 w-8 bg-muted/40 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 w-8 mx-auto bg-muted/40" />
        ))}
        {Array.from({ length: cells }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-md bg-muted animate-pulse"
            style={{ opacity: 1 - (i % 7) * 0.05 }}
          />
        ))}
      </div>
    </div>
  );
}
