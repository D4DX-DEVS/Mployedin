"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, CalendarCheck2, CheckCircle, Edit2, Inbox, Sparkles, XCircle } from "lucide-react";

interface Interview {
  _id: string;
  jobSeekerId?: { fullName?: string };
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  scheduledAt: string;
  type?: string;
  status: string;
  notes?: string;
}

const INTERVIEW_FIELDS: CrudField[] = [
  { name: "scheduledAt", label: "Scheduled At", type: "date", required: true },
  { name: "type", label: "Type", type: "select", options: [
    { value: "video", label: "Video" }, { value: "in-person", label: "In-Person" }, { value: "phone", label: "Phone" },
  ]},
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function AgentInterviewsPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editInterview, setEditInterview] = useState<Interview | null>(null);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (status) params.set("status", status);
    const res = await fetch(`/api/interviews?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInterviews(data.items ?? data.interviews ?? []);
      pagination.updateTotal(data.total ?? data.totalCount ?? 0);
    }
    setLoading(false);
  }, [status, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  useEffect(() => { pagination.resetPage(); }, [status]);

  const updateInterviewStatus = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/interviews/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchInterviews();
  };

  const handleSave = async (values: Record<string, string>) => {
    if (!editInterview) return;
    const res = await fetch(`/api/interviews/${editInterview._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error("Failed to update interview");
    setEditInterview(null);
    fetchInterviews();
  };

  const scheduledCount = interviews.filter((interview) => interview.status === "scheduled").length;
  const completedCount = interviews.filter((interview) => interview.status === "completed").length;
  const cancelledCount = interviews.filter((interview) => interview.status === "cancelled").length;
  const noShowCount = interviews.filter((interview) => interview.status === "no-show").length;

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Interviews</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Keep interview schedules current, mark outcomes quickly, and stay aligned with candidates and employer teams.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Calendar</p><p className="mt-1 text-lg font-semibold text-slate-950">{pagination.total} interviews</p><p className="text-xs text-slate-500">Scheduled and historical interview activity in your scope.</p></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scheduled</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{scheduledCount}</p><p className="mt-1 text-xs text-slate-500">Upcoming interview sessions still on the calendar.</p></div><div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600"><CalendarCheck2 className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{completedCount}</p><p className="mt-1 text-xs text-slate-500">Meetings that already reached a final outcome.</p></div><div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600"><CheckCircle className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cancelled</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{cancelledCount}</p><p className="mt-1 text-xs text-slate-500">Sessions cancelled before they could happen.</p></div><div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600"><XCircle className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">No show</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{noShowCount}</p><p className="mt-1 text-xs text-slate-500">Interviews where attendance broke down.</p></div><div className="rounded-2xl bg-rose-50 p-2.5 text-rose-600"><ArrowRight className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter interviews</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Focus on the interview status that needs a response</h2>
        </div>
        <div className="mt-5 max-w-xs">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No Show</option>
          </select>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Keep each interview updated as decisions land</h2></div><div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"><ArrowRight className="h-3.5 w-3.5 text-sky-600" />{pagination.total} interviews across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead>Candidate</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Employer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              {can("interviews", "update") && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : interviews.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Inbox className="h-8 w-8 text-slate-300" />
                    <span className="text-sm">No interviews found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : interviews.map((iv) => (
              <TableRow key={iv._id} className="hover:bg-slate-50/70">
                <TableCell className="font-medium text-slate-950">{iv.jobSeekerId?.fullName ?? "—"}</TableCell>
                <TableCell className="text-slate-700">{iv.jobId?.title ?? "—"}</TableCell>
                <TableCell className="text-slate-500">{iv.employerId?.companyName ?? "—"}</TableCell>
                <TableCell className="capitalize text-slate-500">{iv.type ?? "in-person"}</TableCell>
                <TableCell className="text-slate-500">{new Date(iv.scheduledAt).toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={iv.status} /></TableCell>
                {can("interviews", "update") && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="xs" onClick={() => { setEditInterview(iv); setModalOpen(true); }} title="Edit" aria-label={`Edit interview for ${iv.jobSeekerId?.fullName ?? "candidate"}`}>
                        <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                      </Button>
                      {iv.status === "scheduled" && (
                        <>
                          <Button variant="ghost" size="xs" onClick={() => updateInterviewStatus(iv._id, "completed")} title="Mark completed" aria-label={`Mark interview for ${iv.jobSeekerId?.fullName ?? "candidate"} completed`}>
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => updateInterviewStatus(iv._id, "cancelled")} title="Cancel" aria-label={`Cancel interview for ${iv.jobSeekerId?.fullName ?? "candidate"}`}>
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditInterview(null); }}
        title="Edit Interview"
        fields={INTERVIEW_FIELDS}
        initialValues={editInterview ? {
          scheduledAt: editInterview.scheduledAt?.slice(0, 10) ?? "",
          type: editInterview.type ?? "video",
          notes: editInterview.notes ?? "",
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}
