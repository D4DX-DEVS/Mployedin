"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock,
  FileText,
  Plus,
  Sparkles,
} from "lucide-react";

interface SmartHeaderProps {
  userName: string;
  newApplications: number;
  scheduledInterviews: number;
  activeJobCount: number;
  lastActivityMinutes: number | null;
  locale: string;
}

export function SmartHeader({
  userName,
  newApplications,
  scheduledInterviews,
  activeJobCount,
  lastActivityMinutes,
  locale,
}: SmartHeaderProps) {
  let subtitle: string;
  let eyebrow = "Hiring workspace";

  if (newApplications > 0) {
    subtitle = "Fresh candidates are waiting in the review queue, with actions and quality signals ready just below.";
    eyebrow = "Review queue is active";
  } else if (scheduledInterviews > 0) {
    subtitle = "Interviews are already lined up, so the dashboard stays focused on quick follow-up and recruiter momentum.";
    eyebrow = "Interview momentum";
  } else if (activeJobCount > 0) {
    subtitle = "Your hiring workspace is live and ready for daily review as new candidates start moving through the funnel.";
    eyebrow = "Employer workspace";
  } else {
    subtitle = "Post your first job to start receiving applications";
    eyebrow = "Ready to launch";
  }

  const newJobHref = `/${locale}/employer/jobs/new`;
  const viewJobsHref = `/${locale}/employer/jobs`;
  const activityLabel = lastActivityMinutes !== null
    ? `Last activity ${formatTimeAgo(lastActivityMinutes)}`
    : "Fresh workspace";

  return (
    <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-5 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.35)] sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
            Welcome back, {userName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {subtitle}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/80 px-3 py-1 backdrop-blur">
              <Clock className="h-3.5 w-3.5 text-sky-600" />
              {activityLabel}
            </span>
            {newApplications > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-amber-700">
                <FileText className="h-3.5 w-3.5" />
                Review queue is live
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row xl:min-w-[260px] xl:flex-col xl:justify-end">
          {activeJobCount > 0 ? (
            <Link
              href={viewJobsHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-white"
            >
              View Jobs
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
          <Link
            href={newJobHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            New Job Posting
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active roles</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{activeJobCount}</p>
              <p className="mt-1 text-xs text-slate-500">Open positions currently collecting candidates.</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Needs review</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{newApplications}</p>
              <p className="mt-1 text-xs text-slate-500">Fresh applicants waiting for a recruiter decision.</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Interviews set</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{scheduledInterviews}</p>
              <p className="mt-1 text-xs text-slate-500">Upcoming conversations already booked with candidates.</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
