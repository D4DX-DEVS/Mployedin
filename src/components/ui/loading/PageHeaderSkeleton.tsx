import { Skeleton } from "@/components/ui/skeleton";

interface PageHeaderSkeletonProps {
  showButton?: boolean;
}

export function PageHeaderSkeleton({ showButton = true }: PageHeaderSkeletonProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <Skeleton className="mb-1.5 h-6 w-44 bg-muted/60" />
        <Skeleton className="h-4 w-32 bg-muted/40" />
      </div>
      {showButton && <Skeleton className="h-9 w-28 bg-muted/50" />}
    </div>
  );
}
