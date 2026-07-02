import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/loading";

export default function SubscriptionLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
