import { Skeleton } from "@/components/ui/skeleton";

export default function TermsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300 space-y-4 max-w-3xl">
      <Skeleton className="h-8 w-64 bg-muted/60" />
      <Skeleton className="h-4 w-full bg-muted/30" />
      <Skeleton className="h-4 w-full bg-muted/30" />
      <Skeleton className="h-4 w-5/6 bg-muted/30" />
      <Skeleton className="h-4 w-full bg-muted/30" />
      <Skeleton className="h-4 w-2/3 bg-muted/30" />
    </div>
  );
}
