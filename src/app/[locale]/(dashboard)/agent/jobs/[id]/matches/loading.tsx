import { PageHeaderSkeleton } from "@/components/ui/loading";
import { ListSkeleton } from "@/components/shared/ListSkeleton";

export default function AgentJobMatchesLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <ListSkeleton count={4} />
    </div>
  );
}
