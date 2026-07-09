import { ListSkeleton } from "@/components/shared/ListSkeleton";

export default function CandidatesLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-40 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-4 w-56 bg-muted/40 rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-9 w-32 bg-muted/50 rounded-md animate-pulse" />
      </div>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-9 w-64 bg-muted/40 rounded-md animate-pulse" />
        <div className="h-9 w-36 bg-muted/40 rounded-md animate-pulse" />
        <div className="h-9 w-36 bg-muted/40 rounded-md animate-pulse" />
      </div>
      <ListSkeleton count={6} layout="grid" itemClassName="h-40" className="gap-4" />
    </div>
  );
}
