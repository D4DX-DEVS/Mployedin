"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle, Eye, ShieldCheck, XCircle, XOctagon } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

interface JobApproval {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  poster?: { approvalStatus?: string };
  createdAt: string;
  employerId?: { name?: string; companyName?: string };
  agentId?: { userId?: string };
  postedByAgent?: { name?: string };
}

export default function SuperAgentApprovalsPage() {
  const [jobs, setJobs] = useState<JobApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/approvals?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleAction = async (id: string, action: "approved" | "rejected", reason?: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/super-agent/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Approval action failed:", data.error ?? res.statusText);
      }
      await loadJobs();
    } finally {
      setProcessingId(null);
    }
  };

  const employerCount = useMemo(
    () => new Set(jobs.map((job) => job.employerId?.companyName ?? job.employerId?.name).filter(Boolean)).size,
    [jobs]
  );

  const kpis = [
    {
      label: "Queue Size",
      value: jobs.length,
      helper: "Jobs returned for the current approval filter and region scope.",
      icon: <ShieldCheck className="h-5 w-5" />,
      toneClassName: "bg-sky-50 text-sky-600",
    },
    {
      label: "Approved",
      value: jobs.filter((job) => job.poster?.approvalStatus === "approved").length,
      helper: "Visible jobs already approved in the current results set.",
      icon: <CheckCircle className="h-5 w-5" />,
      toneClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Rejected",
      value: jobs.filter((job) => job.poster?.approvalStatus === "rejected").length,
      helper: "Jobs that were declined and may need revision before relaunch.",
      icon: <XOctagon className="h-5 w-5" />,
      toneClassName: "bg-rose-50 text-rose-600",
    },
    {
      label: "Employers",
      value: employerCount,
      helper: "Distinct employers represented in the current approval queue.",
      icon: <Eye className="h-5 w-5" />,
      toneClassName: "bg-indigo-50 text-indigo-600",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Regional Job Approvals"
        description="Review job postings inside your region before they go live, and clear approval decisions from the same oversight workspace used elsewhere in the super-agent flow."
        summaryTitle="Decision lane"
        summaryDescription="The status tabs and action buttons still call the same approval endpoints; this pass only modernizes the operating surface."
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Approvals"
        title="Process the regional approval queue"
        description="Switch between statuses, inspect who posted each job, and approve or reject pending items without changing route structure or mutation behavior."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {["pending", "approved", "rejected"].map((s) => (
            <Button
              key={s}
              onClick={() => setFilter(s)}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              className={`capitalize ${filter === s ? "bg-slate-950 text-white hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              {s}
            </Button>
          ))}
        </div>

        <SuperAgentDataTableShell>
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Job Title</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employer</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Posted By</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date</TableHead>
                  <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-slate-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : jobs.length === 0 ? (
            <SuperAgentEmptyState
              icon={<ShieldCheck className="h-7 w-7" />}
              title={`No ${filter} approvals in your region`}
              description="Switch filters or wait for new job approvals to enter the queue."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Job Title</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employer</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Posted By</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date</TableHead>
                  <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id} className="border-slate-100 hover:bg-sky-50/30">
                    <TableCell className="py-4 font-medium text-slate-950">{job.title}</TableCell>
                    <TableCell className="py-4 text-slate-500">{job.employerId?.companyName ?? job.employerId?.name ?? "—"}</TableCell>
                    <TableCell className="py-4 text-slate-500">{job.postedByAgent?.name ?? "Employer"}</TableCell>
                    <TableCell className="py-4 text-slate-500">{typeof job.location === "object" && job.location ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ") || "—") : (job.location ?? "—")}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={job.poster?.approvalStatus ?? "pending"} /></TableCell>
                    <TableCell className="py-4 text-slate-500">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Details coming soon" disabled>
                          <Eye className="h-4 w-4 text-slate-500" />
                        </Button>
                        {filter === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                              onClick={() => handleAction(job._id, "approved")}
                              disabled={processingId === job._id}
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                              onClick={() => handleAction(job._id, "rejected")}
                              disabled={processingId === job._id}
                              title="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SuperAgentDataTableShell>
      </SuperAgentSection>
    </div>
  );
}
