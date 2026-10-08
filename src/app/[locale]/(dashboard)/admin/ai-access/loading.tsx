import { PageHeaderSkeleton, TableRowsSkeleton } from "@/components/ui/loading";

export default function AiAccessLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <TableRowsSkeleton rows={4} cols={6} />
    </div>
  );
}
