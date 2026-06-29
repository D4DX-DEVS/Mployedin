import { Skeleton } from "@/components/ui/skeleton";

interface PageHeaderSkeletonProps {
  showButton?: boolean;
}

export function PageHeaderSkeleton({ showButton = true }: PageHeaderSkeletonProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <Skeleton className="h-7 w-48 bg-muted/60 mb-2" />
        <Skeleton className="h-4 w-32 bg-muted/40" />
      </div>
      {showButton && <Skeleton className="h-9 w-28 bg-muted/50" />}
    </div>
  );
}
