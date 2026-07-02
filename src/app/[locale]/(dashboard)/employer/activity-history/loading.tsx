import { PageHeaderSkeleton, CardListSkeleton } from "@/components/ui/loading";

export default function ActivityHistoryLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <CardListSkeleton count={6} />
    </div>
  );
}
