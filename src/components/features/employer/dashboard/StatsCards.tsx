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
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-200/80 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <Briefcase className="h-3.5 w-3.5 text-sky-600" />
          Current openings
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Jump to the queues your team uses most.</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-600">
          Open roles and applications stay one click away when employers need to move quickly.
        </p>
      </div>

      <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
        <Link
          href={`/${locale}/employer/jobs`}
          className="group flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white/90 px-3.5 py-3.5 transition-all hover:-translate-y-0.5 hover:border-sky-200 sm:px-4 sm:py-4"
        >
          <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600">
            <Briefcase className="h-4 w-4 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Roles</p>
            <span className="mt-1 block text-sm font-medium text-slate-800">Active jobs</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-950">{activeJobs}</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-sky-600" />
        </Link>

        <Link
          href={`/${locale}/employer/applications`}
          className="group flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white/90 px-3.5 py-3.5 transition-all hover:-translate-y-0.5 hover:border-sky-200 sm:px-4 sm:py-4"
        >
          <div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600">
            <FileText className="h-4 w-4 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Candidates</p>
            <span className="mt-1 block text-sm font-medium text-slate-800">All applications</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-950">{totalApplications}</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-sky-600" />
        </Link>
      </div>
    </section>
  );
}

interface OpeningsStatsProps {
  activeJobs: number;
  totalApplications: number;
}

export function OpeningsStats({ activeJobs, totalApplications }: OpeningsStatsProps) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current portfolio</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">See hiring volume at a glance.</h2>
      <div className="mt-4 space-y-2.5">
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-3.5 sm:px-4 sm:py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active jobs</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{activeJobs}</p>
          <p className="mt-1 text-xs text-slate-500">Roles open for new candidates.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-3.5 py-3.5 sm:px-4 sm:py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Open applications</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{totalApplications}</p>
          <p className="mt-1 text-xs text-slate-500">Candidates currently moving through the funnel.</p>
        </div>
      </div>
    </section>
  );
}

interface TimeToHireProps {
  avgDays: number | null;
}

export function TimeToHire({ avgDays }: TimeToHireProps) {
  return (
    <section className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,_rgba(255,251,235,0.98),_rgba(255,247,237,0.96))] p-4 shadow-[0_24px_60px_-46px_rgba(245,158,11,0.32)] sm:p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
        <Clock className="h-3.5 w-3.5" />
        Time to hire
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Monitor how fast your team closes roles.</h2>
      {avgDays !== null ? (
        <>
          <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
            {Math.round(avgDays)}
            <span className="ml-2 text-base font-medium text-slate-500">days</span>
          </p>
          <p className="mt-1.5 text-sm text-slate-600">Average time between application and successful placement.</p>
        </>
      ) : (
        <>
          <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-400">—</p>
          <p className="mt-1.5 text-sm text-slate-600">No hires recorded yet, so this benchmark will appear once placements start closing.</p>
        </>
      )}
    </section>
  );
}
