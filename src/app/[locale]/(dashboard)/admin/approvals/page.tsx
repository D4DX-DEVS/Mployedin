"use client";

import { useEffect, useState, useCallback } from "react";
import { Eye, Briefcase, MapPin, Building2, Clock, Search, DollarSign, Calendar, Globe, Users, UserCheck, FileText, Sparkles, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface Job {
  _id: string;
  title: string;
  description?: string;
  location?: string | { isRemote?: boolean; city?: string; country?: string };
  category?: string;
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean };
  employmentType?: string;
  workMode?: string;
  vacancies?: number;
  requirements?: { skills?: string[]; experience?: string; education?: string };
  responsibilities?: string[];
  benefits?: string[];
  employerId?: { _id?: string; companyName?: string; country?: string };
  agentId?: { _id?: string; userId?: { _id?: string; name?: string; email?: string }; superAgentId?: { _id?: string; userId?: { name?: string } } };
  poster?: { approvalStatus?: "pending" | "approved" | "rejected" };
  status: string;
  applicantsCount?: number;
  createdAt: string;
}

interface FilterOption { value: string; label: string }

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
  { value: "expired", label: "Expired" },
];

const APPROVAL_OPTIONS: FilterOption[] = [
  { value: "all", label: "All approvals" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function getApproval(job: Job) {
  return job.poster?.approvalStatus ?? "pending";
}

function formatLocation(loc?: string | { isRemote?: boolean; city?: string; country?: string }) {
  if (!loc) return "—";
  if (typeof loc === "string") return loc;
  if (loc.isRemote) return "Remote";
  return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
}

function getAgentName(job: Job) {
  return job.agentId?.userId?.name ?? null;
}

function getSuperAgentName(job: Job) {
  return job.agentId?.superAgentId?.userId?.name ?? null;
}

export default function AdminApprovalsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [approvalStatus, setApprovalStatus] = useState("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Entity filters
  const [employers, setEmployers] = useState<FilterOption[]>([]);
  const [agents, setAgents] = useState<FilterOption[]>([]);
  const [superAgentsList, setSuperAgentsList] = useState<FilterOption[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedSuperAgent, setSelectedSuperAgent] = useState("all");

  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  useEffect(() => { document.title = "All Jobs · MPLOYEDIN"; }, []);

  // Fetch filter options
  useEffect(() => {
    (async () => {
      try {
        const [empRes, agentRes, saRes] = await Promise.all([
          fetch("/api/employers?limit=500&fields=companyName"),
          fetch("/api/admin/agents?limit=500"),
          fetch("/api/admin/super-agents?limit=500"),
        ]);
        if (empRes.ok) {
          const data = await empRes.json();
          const list = (data.employers ?? data.items ?? data ?? []) as { _id: string; companyName?: string }[];
          setEmployers([{ value: "all", label: "All employers" }, ...list.map((e) => ({ value: e._id, label: e.companyName ?? e._id }))]);
        }
        if (agentRes.ok) {
          const data = await agentRes.json();
          const list = (data.agents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setAgents([{ value: "all", label: "All agents" }, ...list.map((a) => {
            const label = typeof a.userId === "object" ? (a.userId?.name ?? a.userId?.email ?? a._id) : (a.name ?? a._id);
            return { value: a._id, label };
          })]);
        }
        if (saRes.ok) {
          const data = await saRes.json();
          const list = (data.superAgents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setSuperAgentsList([{ value: "all", label: "All super agents" }, ...list.map((s) => {
            const label = typeof s.userId === "object" ? (s.userId?.name ?? s.userId?.email ?? s._id) : (s.name ?? s._id);
            return { value: s._id, label };
          })]);
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (approvalStatus !== "all") params.set("approvalStatus", approvalStatus);
      if (selectedEmployer !== "all") params.set("employerId", selectedEmployer);
      if (selectedAgent !== "all") params.set("agentId", selectedAgent);
      if (selectedSuperAgent !== "all") params.set("superAgentId", selectedSuperAgent);

      const res = await fetch(`/api/admin/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? data.items ?? []);
        updateTotal(data.pagination?.total ?? data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, status, approvalStatus, selectedEmployer, selectedAgent, selectedSuperAgent, page, limit, updateTotal]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const exportColumns: ExportColumn<Job>[] = [
    { header: "Title", key: "title" },
    { header: "Employer", key: "employerId" as keyof Job, formatter: (_v, r) => (r as unknown as Job).employerId?.companyName ?? "—" },
    { header: "Agent", key: "agentId" as keyof Job, formatter: (_v, r) => getAgentName(r as unknown as Job) ?? "—" },
    { header: "Status", key: "status" },
    { header: "Approval", key: "poster" as keyof Job, formatter: (_v, r) => getApproval(r as unknown as Job) },
    { header: "Location", key: "location", formatter: (v) => formatLocation(v as Job["location"]) },
    { header: "Applicants", key: "applicantsCount", formatter: (v) => String(v ?? 0) },
    { header: "Created", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "approvals",
    title: "Job Approvals",
  });

  const pending = jobs.filter((j) => getApproval(j) === "pending").length;
  const active = jobs.filter((j) => j.status === "active").length;

  return (
    <div className="page-container space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="max-w-3xl">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            All jobs
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            Platform Jobs Overview
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            View all job postings across the platform. Filter by employer, agent, super agent, status, or approval state.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{total.toLocaleString()}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{active}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending</p>
            <p className="mt-2 text-2xl font-semibold text-amber-500 dark:text-amber-300">{pending}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">This page</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{jobs.length}</p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Find specific jobs</h2>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <TableToolbar
            search={search}
            onSearchChange={(v) => { setSearch(v); resetPage(); }}
            searchPlaceholder="Search by job title…"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            className="xl:col-span-3"
          />
          <div>
            <label htmlFor="approvals-status" className="sr-only">Status</label>
            <SearchableSelect id="approvals-status" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={STATUS_OPTIONS} value={status} onValueChange={(v) => { setStatus(v); resetPage(); }} placeholder="All statuses" />
          </div>
          <div>
            <label htmlFor="approvals-approval" className="sr-only">Approval</label>
            <SearchableSelect id="approvals-approval" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={APPROVAL_OPTIONS} value={approvalStatus} onValueChange={(v) => { setApprovalStatus(v); resetPage(); }} placeholder="All approvals" />
          </div>
          {employers.length > 1 && (
            <div>
              <label htmlFor="approvals-employer" className="sr-only">Employer</label>
              <SearchableSelect id="approvals-employer" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={employers} value={selectedEmployer} onValueChange={(v) => { setSelectedEmployer(v); resetPage(); }} placeholder="All employers" />
            </div>
          )}
          {agents.length > 1 && (
            <div>
              <label htmlFor="approvals-agent" className="sr-only">Agent</label>
              <SearchableSelect id="approvals-agent" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={agents} value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); resetPage(); }} placeholder="All agents" />
            </div>
          )}
          {superAgentsList.length > 1 && (
            <div>
              <label htmlFor="approvals-sa" className="sr-only">Super Agent</label>
              <SearchableSelect id="approvals-sa" className="h-11 w-full rounded-xl border-border bg-secondary/65" options={superAgentsList} value={selectedSuperAgent} onValueChange={(v) => { setSelectedSuperAgent(v); resetPage(); }} placeholder="All super agents" />
            </div>
          )}
        </div>
      </section>

      {/* Table */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="workspace-panel-surface h-24 animate-pulse rounded-[28px]" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="workspace-panel-surface flex flex-col items-center gap-3 rounded-[28px] py-16 text-center">
          <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div>
          <p className="text-sm font-semibold text-foreground">No jobs found</p>
          <p className="text-sm text-muted-foreground">Adjust the filters to widen the view.</p>
        </div>
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                  <TableHead>Title</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Posted By</TableHead>
                  <TableHead>Super Agent</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead className="text-right">Apps</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-center">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id} className="border-border/70">
                    <TableCell className="max-w-[240px]">
                      <div>
                        <p className="truncate font-medium text-foreground">{job.title}</p>
                        {job.category && <p className="mt-0.5 text-xs text-muted-foreground">{job.category}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{job.employerId?.companyName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getAgentName(job) ?? "Employer"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getSuperAgentName(job) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatLocation(job.location)}</TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell><StatusBadge status={getApproval(job)} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">{job.applicantsCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedJob(job)}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View details</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-border/80 px-4 py-3 sm:px-5">
            <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} className="text-muted-foreground" />
          </div>
        </section>
      )}

      {/* Job detail dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => { if (!open) setSelectedJob(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-lg">
                  {selectedJob.title}
                  <StatusBadge status={getApproval(selectedJob)} />
                </DialogTitle>
                <DialogDescription className="sr-only">Review details and approval status for this job listing.</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 pt-2">
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedJob.employerId?.companyName && (
                    <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {selectedJob.employerId.companyName}</span>
                  )}
                  {selectedJob.category && (
                    <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {selectedJob.category}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Fact icon={MapPin} label="Location" value={formatLocation(selectedJob.location)} />
                  <Fact icon={DollarSign} label="Salary" value={selectedJob.salary?.isNegotiable ? "Negotiable" : selectedJob.salary?.min ? `${selectedJob.salary.min.toLocaleString()} – ${selectedJob.salary.max?.toLocaleString()} ${selectedJob.salary.currency ?? ""}` : "—"} />
                  {selectedJob.employmentType && <Fact icon={Clock} label="Type" value={selectedJob.employmentType.replace(/_/g, " ")} />}
                  {selectedJob.workMode && <Fact icon={Globe} label="Work mode" value={selectedJob.workMode.replace(/_/g, " ")} />}
                  {(selectedJob.vacancies ?? 0) > 0 && <Fact icon={Users} label="Vacancies" value={String(selectedJob.vacancies)} />}
                  <Fact icon={Calendar} label="Posted" value={new Date(selectedJob.createdAt).toLocaleDateString()} />
                  <Fact icon={UserCheck} label="Posted by" value={getAgentName(selectedJob) ?? "Employer"} />
                  {getSuperAgentName(selectedJob) && <Fact icon={UserCheck} label="Super agent" value={getSuperAgentName(selectedJob)!} />}
                </div>

                {selectedJob.description && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
                    <p className="text-sm leading-relaxed text-foreground line-clamp-6">{selectedJob.description}</p>
                  </div>
                )}

                {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required Skills</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.requirements!.skills!.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedJob.requirements?.experience || selectedJob.requirements?.education) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedJob.requirements?.experience && <Fact icon={Briefcase} label="Experience" value={selectedJob.requirements.experience} />}
                    {selectedJob.requirements?.education && <Fact icon={FileText} label="Education" value={selectedJob.requirements.education} />}
                  </div>
                )}

                {(selectedJob.responsibilities?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsibilities</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
                      {selectedJob.responsibilities!.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}

                {(selectedJob.benefits?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Benefits</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
                      {selectedJob.benefits!.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
