import { Skeleton } from "@/components/ui/skeleton";
import { SECTION_PANEL } from "./dashboard-section";

interface SectionSkeletonProps {
  /** Announced while the section loads, e.g. "Loading recruitment". */
  label: string;
  cards?: number;
  rows?: number;
  /** Grid columns of the placeholder cards; mirror the real section so nothing jumps. */
  className?: string;
}

/** Placeholder shaped like a section: heading, then cards of rows. */
export function SectionSkeleton({ label, cards = 3, rows = 4, className = "md:grid-cols-2 xl:grid-cols-3" }: SectionSkeletonProps) {
  return (
    <section aria-busy="true" aria-label={label} className={SECTION_PANEL} data-surface="light-panel">
      <div className="flex items-center gap-2.5 [flex-wrap:nowrap]">
        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      </div>
      <div className={`mt-3 grid gap-3 sm:mt-4 ${className}`}>
        {Array.from({ length: cards }, (_, card) => (
          <div key={card} className="workspace-subtle-surface rounded-xl p-3 sm:p-3.5">
            <Skeleton className="h-4 w-28" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: rows }, (_, row) => (
                <Skeleton key={row} className="h-5 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
