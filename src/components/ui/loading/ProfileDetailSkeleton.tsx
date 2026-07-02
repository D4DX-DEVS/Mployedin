import { Skeleton } from "@/components/ui/skeleton";

interface ProfileDetailSkeletonProps {
  tabs?: number;
  sections?: number;
}

export function ProfileDetailSkeleton({ tabs = 4, sections = 3 }: ProfileDetailSkeletonProps) {
  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="h-16 w-16 rounded-full bg-muted/60 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-6 w-56 bg-muted/60" />
          <Skeleton className="h-4 w-40 bg-muted/40" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 bg-muted/40 rounded-full" />
            <Skeleton className="h-5 w-16 bg-muted/40 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 bg-muted/50" />
      </div>
      <div className="flex gap-2 mb-6 border-b border-border pb-2">
        {Array.from({ length: tabs }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 bg-muted/40 rounded-md" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: sections }).map((_, i) => (
          <div key={i} className="card-base p-5 space-y-3" style={{ opacity: 1 - i * 0.1 }}>
            <Skeleton className="h-4 w-32 bg-muted/50" />
            <Skeleton className="h-4 w-full bg-muted/30" />
            <Skeleton className="h-4 w-5/6 bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  );
}
