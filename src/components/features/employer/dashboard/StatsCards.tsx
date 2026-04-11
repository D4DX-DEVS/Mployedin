import Link from "next/link";
import { Briefcase, FileText, Clock, ChevronRight } from "lucide-react";

interface CurrentOpeningsListProps {
  activeJobs: number;
  totalApplications: number;
  locale: string;
}

export function CurrentOpeningsList({
  activeJobs,
  totalApplications,
  locale,
}: CurrentOpeningsListProps) {
  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Current Openings</h2>
      </div>

      <div className="px-4 pb-4 sm:px-5 space-y-1">
        <Link
          href={`/${locale}/employer/jobs`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
        >
          <Briefcase className="h-4 w-4 text-primary/70 shrink-0" />
          <span className="text-sm text-foreground/80 flex-1">Active Jobs</span>
          <span className="text-sm font-semibold text-foreground">{activeJobs}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </Link>

        <Link
          href={`/${locale}/employer/applications`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
        >
          <FileText className="h-4 w-4 text-primary/70 shrink-0" />
          <span className="text-sm text-foreground/80 flex-1">All Applications</span>
          <span className="text-sm font-semibold text-foreground">{totalApplications}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </Link>
      </div>
    </div>
  );
}

interface OpeningsStatsProps {
  activeJobs: number;
  totalApplications: number;
}

export function OpeningsStats({ activeJobs, totalApplications }: OpeningsStatsProps) {
  return (
    <div className="card-base p-5 sm:p-6">
      <h2 className="text-base font-semibold text-foreground mb-4">Current Openings</h2>
      <div className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-foreground">
            {activeJobs}
            <span className="text-base font-medium text-muted-foreground ml-2">Active Jobs</span>
          </p>
        </div>
        <div>
          <p className="text-xl font-semibold text-foreground">
            {totalApplications}
            <span className="text-sm font-medium text-muted-foreground ml-2">Open Applications</span>
          </p>
        </div>
      </div>
    </div>
  );
}

interface TimeToHireProps {
  avgDays: number | null;
}

export function TimeToHire({ avgDays }: TimeToHireProps) {
  return (
    <div className="card-base p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Time to Hire</h2>
      </div>
      {avgDays !== null ? (
        <>
          <p className="text-3xl font-bold text-foreground">
            {Math.round(avgDays)}
            <span className="text-base font-medium text-muted-foreground ml-1">Days</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Avg. Time to Hire</p>
        </>
      ) : (
        <>
          <p className="text-3xl font-bold text-muted-foreground/40">—</p>
          <p className="text-xs text-muted-foreground mt-1">No hires recorded yet</p>
        </>
      )}
    </div>
  );
}
