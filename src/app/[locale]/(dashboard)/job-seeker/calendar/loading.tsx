import { PageHeaderSkeleton, CalendarSkeleton } from "@/components/ui/loading";

export default function CalendarLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton showButton={false} />
      <CalendarSkeleton />
    </div>
  );
}
