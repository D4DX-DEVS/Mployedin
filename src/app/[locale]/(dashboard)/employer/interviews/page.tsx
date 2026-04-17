"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Inbox, Sparkles, CalendarDays, CircleCheckBig, RotateCcw, ArrowRight, Clock3 } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { AIInterviewQuestionsPanel } from "@/components/features/employer/AIInterviewQuestionsPanel";
import { useInterviews, useUpdateInterview } from "@/hooks/useInterviews";
import type { Interview } from "@/hooks/useInterviews";

interface AIQuestionsTarget {
  jobTitle: string;
  candidateName: string;
  skills: string[];
  experienceYears: number;
}

export default function EmployerInterviewsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { can } = usePermissions();
  const [status, setStatus] = useState("");
  const [aiTarget, setAiTarget] = useState<AIQuestionsTarget | null>(null);

  const { data, isLoading: loading, error, refetch } = useInterviews({ page, limit, status: status || undefined });
  const updateMutation = useUpdateInterview();

  const interviews = data?.interviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const now = Date.now();
  const upcomingCount = interviews.filter((iv) => new Date(iv.scheduledAt).getTime() > now && ["scheduled", "confirmed", "rescheduled"].includes(iv.status)).length;
  const completedCount = interviews.filter((iv) => iv.status === "completed").length;
  const attentionCount = interviews.filter((iv) => iv.status === "rescheduled" || iv.status === "cancelled").length;

  function formatDateTime(value: string): { date: string; time: string } {
    const date = new Date(value);
    return {
      date: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  }

  function getInterviewSkills(interview: Interview): string[] {
    const merged = [
      ...(interview.jobId?.requirements?.skills ?? []),
      ...(interview.jobSeekerId?.skills ?? []),
    ].filter((skill, index, values) => Boolean(skill) && values.indexOf(skill) === index);

    return merged.slice(0, 3);
  }

  useEffect(() => { setPage(1); }, [status]);

  function openAIQuestions(iv: Interview) {
    const skills = [
      ...(iv.jobId?.requirements?.skills ?? []),
      ...(iv.jobSeekerId?.skills ?? []),
    ].filter((s, i, a) => a.indexOf(s) === i).slice(0, 15);

    const expYears = iv.jobSeekerId?.experience?.length
      ? iv.jobSeekerId.experience.reduce((acc, e) => {
          if (!e.startDate) return acc;
          const years = (Date.now() - new Date(e.startDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
          return acc + Math.min(years, 30);
        }, 0)
      : (iv.jobId?.requirements?.experienceMin ?? 3);

    setAiTarget({
      jobTitle: iv.jobId?.title ?? "Unknown Role",
      candidateName: iv.jobSeekerId?.fullName ?? "Candidate",
      skills,
      experienceYears: Math.round(expYears),
    });
  }

  async function updateInterviewStatus(id: string, newStatus: string) {
    await updateMutation.mutateAsync({ id, status: newStatus });
  }

  return (
    <div className="page-container employer-legacy-surface space-y-6">
      {aiTarget && (
        <AIInterviewQuestionsPanel
          jobTitle={aiTarget.jobTitle}
          candidateName={aiTarget.candidateName}
          skills={aiTarget.skills}
          experienceYears={aiTarget.experienceYears}
          onClose={() => setAiTarget(null)}
        />
      )}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Interview workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Keep interview momentum visible across every candidate touchpoint.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review upcoming sessions, reschedules, and completions in one cleaner operations view without losing the quick scheduling flow.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{total} interview records</p>
              <p className="text-xs text-muted-foreground">Scheduled, confirmed, completed, and changed sessions together.</p>
            </div>
            {can("interviews", "create") ? (
              <Button
                asChild
                className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Link href={`/${locale}/employer/interviews/bulk`}>
                  Bulk Schedule
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Upcoming",
              value: upcomingCount,
              note: "Future interviews in the current result set.",
              icon: CalendarDays,
              tone: "text-sky-600",
              chip: "bg-sky-50",
            },
            {
              label: "Completed",
              value: completedCount,
              note: "Completed sessions visible on this page.",
              icon: CircleCheckBig,
              tone: "text-emerald-600",
              chip: "bg-emerald-50",
            },
            {
              label: "Rescheduled or cancelled",
              value: attentionCount,
              note: "Changed sessions inside the current result set.",
              icon: RotateCcw,
              tone: "text-amber-600",
              chip: "bg-amber-50",
            },
            {
              label: "Awaiting action",
              value: interviews.filter((iv) => iv.status === "scheduled").length,
              note: "Scheduled sessions visible in the current result set.",
              icon: Clock3,
              tone: "text-violet-600",
              chip: "bg-violet-50",
            },
          ].map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter schedule</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Focus the calendar on the interview status you need.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              This page stays tied to the existing interview API, so status remains the one supported filter while the workspace becomes easier to scan.
            </p>
          </div>

          <SearchableSelect
            className="w-full min-w-[220px] sm:w-60"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "scheduled", label: "Scheduled" },
              { value: "confirmed", label: "Confirmed" },
              { value: "rescheduled", label: "Rescheduled" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            value={status || "all"}
            onValueChange={(v) => setStatus(v === "all" ? "" : v)}
            placeholder="All Statuses"
          />
        </div>
      </section>

      {error ? (
        <section className="workspace-panel-surface rounded-[28px] border border-destructive/30 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Interview list</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Unable to load interviews right now</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {error instanceof Error ? error.message : "The interview workspace could not load. Try again in a moment."}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </section>
      ) : (
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Interview list</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Track who is meeting, when, and what needs attention next.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Candidate context, role detail, schedule timing, and AI question generation stay inside one consistent workspace.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{interviews.length} interviews on this page</p>
        </div>

        <div className="workspace-subtle-surface mt-5 overflow-x-auto rounded-3xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                <TableHead className="min-w-[220px]">Candidate</TableHead>
                <TableHead className="min-w-[260px]">Role</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI</TableHead>
                {can("interviews", "update") ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: can("interviews", "update") ? 7 : 6 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : interviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={can("interviews", "update") ? 7 : 6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="workspace-tone-sky flex h-14 w-14 items-center justify-center rounded-3xl">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No interviews scheduled yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Once candidates move into interview stages, they will appear here for tracking and follow-up.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : interviews.map((iv) => {
                const scheduled = formatDateTime(iv.scheduledAt);
                const skills = getInterviewSkills(iv);

                return (
                  <TableRow key={iv._id} className="hover:bg-secondary/50">
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{iv.jobSeekerId?.fullName ?? "Candidate"}</p>
                        <p className="text-xs text-muted-foreground">{iv.jobSeekerId?.email ?? "No email available"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">{iv.jobId?.title ?? "Untitled role"}</p>
                        {skills.length ? (
                          <div className="flex flex-wrap gap-2">
                            {skills.map((skill) => (
                              <span key={skill} className="workspace-muted-pill rounded-full px-2.5 py-1 text-[11px] font-medium">
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{iv.type ?? "in-person"}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>{scheduled.date}</p>
                        <p className="text-xs text-muted-foreground">{scheduled.time}</p>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={iv.status} /></TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-xl px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                        onClick={() => openAIQuestions(iv)}
                        title="Generate AI interview questions"
                      >
                        <Sparkles className="me-1 h-3.5 w-3.5" />
                        Questions
                      </Button>
                    </TableCell>
                    {can("interviews", "update") ? (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {iv.status === "scheduled" ? (
                            <>
                              <Button variant="ghost" size="sm" className="h-8 rounded-xl px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                onClick={() => updateInterviewStatus(iv._id, "completed")}>
                                Complete
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 rounded-xl px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                                onClick={() => updateInterviewStatus(iv._id, "cancelled")}>
                                Cancel
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
}
