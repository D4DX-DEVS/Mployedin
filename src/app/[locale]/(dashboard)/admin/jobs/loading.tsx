import { PageHeaderSkeleton, TableRowsSkeleton } from "@/components/ui/loading";

export default function JobsLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <TableRowsSkeleton rows={8} cols={5} />
    </div>
  );
}
