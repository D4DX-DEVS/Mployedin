import { Suspense } from "react";
import { RightPanel } from "@/components/features/job-seeker/dashboard/RightPanel";

function RightPanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="card-base p-4">
          <div className="h-3 w-24 rounded bg-muted mb-3" />
          <div className="space-y-2">
            <div className="h-2.5 rounded bg-muted w-full" />
            <div className="h-2.5 rounded bg-muted w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function JobSeekerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      {/* Main content — left column */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        {children}
      </div>

      {/* Right panel — desktop only (35%) */}
      <aside className="hidden xl:flex xl:w-[340px] xl:shrink-0 xl:flex-col border-l border-border/40 p-4 gap-4 overflow-y-auto">
        <Suspense fallback={<RightPanelSkeleton />}>
          <RightPanel />
        </Suspense>
      </aside>
    </div>
  );
}
