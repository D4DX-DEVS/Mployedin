import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/shared/DashboardKit";

export { KpiStripSkeleton, PanelSkeleton } from "@/app/[locale]/(dashboard)/admin/_components/section-states";

/** The workspace header while the scope and time zone resolve. */
export function HeaderSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="workspace-header" data-workspace-header="">
      <div className="workspace-header-row">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="hidden h-10 w-36 rounded-xl sm:block" />
      </div>
    </div>
  );
}

/** A section whose queries failed; the rest of the page is unaffected. */
export function SectionFailed({ id, title, message }: { id: string; title: string; message: string }) {
  return (
    <Panel id={id} icon={AlertTriangle} iconClassName="bg-rose-100 text-rose-800" title={title}>
      <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground" role="alert">
        {message}
      </p>
    </Panel>
  );
}
