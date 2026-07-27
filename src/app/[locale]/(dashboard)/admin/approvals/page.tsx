"use client";

import { useEffect, useState, useCallback, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { Eye, Briefcase, MapPin, Building2, Clock, DollarSign, Calendar, Globe, Users, UserCheck, FileText, Inbox, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const t = useTranslations("adminApprovals");
  const tJobs = useTranslations("adminJobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [approvalCounts, setApprovalCounts] = useState<Record<string, number>>({});
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

  // Status and approval options
  const STATUS_OPTIONS: FilterOption[] = [
    { value: "all", label: t("allStatuses") },
    { value: "draft", label: t("draft") },
    { value: "active", label: t("statusActive") },
    { value: "paused", label: t("paused") },
    { value: "closed", label: t("closed") },
    { value: "expired", label: t("expired") },
  ];

  const APPROVAL_OPTIONS: FilterOption[] = [
    { value: "all", label: t("allApprovals") },
    { value: "pending", label: t("approvalPending") },
    { value: "approved", label: t("approvalApproved") },
    { value: "rejected", label: t("approvalRejected") },
  ];

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
          setEmployers([{ value: "all", label: t("allEmployers") }, ...list.map((e) => ({ value: e._id, label: e.companyName ?? e._id }))]);
        } else {
          const e = await empRes.json().catch(() => ({}));
          toast.error(e.error ?? "Failed to load employers");
        }
        if (agentRes.ok) {
          const data = await agentRes.json();
          const list = (data.agents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setAgents([{ value: "all", label: t("allAgents") }, ...list.map((a) => {
            const label = typeof a.userId === "object" ? (a.userId?.name ?? a.userId?.email ?? a._id) : (a.name ?? a._id);
            return { value: a._id, label };
          })]);
        } else {
          const e = await agentRes.json().catch(() => ({}));
          toast.error(e.error ?? "Failed to load agents");
        }
        if (saRes.ok) {
          const data = await saRes.json();
          const list = (data.superAgents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setSuperAgentsList([{ value: "all", label: t("allSuperAgents") }, ...list.map((s) => {
            const label = typeof s.userId === "object" ? (s.userId?.name ?? s.userId?.email ?? s._id) : (s.name ?? s._id);
            return { value: s._id, label };
          })]);
        } else {
          const e = await saRes.json().catch(() => ({}));
          toast.error(e.error ?? "Failed to load super agents");
        }
      } catch {
        toast.error("Failed to load filter options");
      }
    })();
  }, [t]);

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
        setStatusCounts(data.statusCounts ?? {});
        setApprovalCounts(data.approvalCounts ?? {});
        updateTotal(data.pagination?.total ?? data.total ?? 0);
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? "Failed to load jobs");
      }
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [search, status, approvalStatus, selectedEmployer, selectedAgent, selectedSuperAgent, page, limit, updateTotal]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const [actingId, setActingId] = useState<string | null>(null);

  const decideJob = async (jobId: string, approved: boolean) => {
    setActingId(jobId);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) throw new Error();
      toast.success(approved ? tJobs("jobApprovedSuccess") : tJobs("jobRejectedSuccess"));
      setSelectedJob(null);
      fetchJobs();
    } catch {
      toast.error(approved ? tJobs("jobApprovalFailed") : tJobs("jobRejectionFailed"));
    } finally {
      setActingId(null);
    }
  };

  const exportColumns: ExportColumn<Job>[] = [
    { header: t("tableHeaderTitle"), key: "title" },
    { header: t("tableHeaderEmployer"), key: "employerId" as keyof Job, formatter: (_v, r) => (r as unknown as Job).employerId?.companyName ?? "—" },
    { header: t("tableHeaderPostedBy"), key: "agentId" as keyof Job, formatter: (_v, r) => getAgentName(r as unknown as Job) ?? "—" },
    { header: t("tableHeaderStatus"), key: "status" },
    { header: t("tableHeaderApproval"), key: "poster" as keyof Job, formatter: (_v, r) => getApproval(r as unknown as Job) },
    { header: t("tableHeaderLocation"), key: "location", formatter: (v) => formatLocation(v as Job["location"]) },
    { header: t("tableHeaderApps"), key: "applicantsCount", formatter: (v) => String(v ?? 0) },
    { header: t("tableHeaderPosted"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "approvals",
    title: t("platformJobsOverview"),
  });

  const pending = approvalCounts.pending ?? jobs.filter((j) => getApproval(j) === "pending").length;
  const active = statusCounts.active ?? jobs.filter((j) => j.status === "active").length;

  return (
    <div className="page-container space-y-6">
      <DashboardPageHeader
        eyebrow={t("allJobs")}
        title={t("platformJobsOverview")}
        description={t("platformJobsDescription")}
        metrics={[
          {
            label: t("total"),
            value: total.toLocaleString(),
            icon: Briefcase,
            iconClassName: "text-status-applied",
            iconSurfaceClassName: "bg-status-applied-bg dark:bg-sky-950/30",
          },
          {
            label: t("active"),
            value: active,
            icon: UserCheck,
            iconClassName: "text-status-selected",
            iconSurfaceClassName: "bg-status-selected-bg dark:bg-emerald-950/30",
          },
          {
            label: t("pending"),
            value: pending,
            icon: Clock,
            iconClassName: "text-status-shortlisted",
            iconSurfaceClassName: "bg-status-shortlisted-bg dark:bg-amber-950/30",
          },
          {
            label: t("thisPage"),
            value: jobs.length,
            icon: FileText,
            iconClassName: "text-status-interview",
            iconSurfaceClassName: "bg-status-interview-bg dark:bg-violet-950/30",
          },
        ]}
      />

      {/* Filters */}
      <TableToolbar
        title={t("findSpecificJobs")}
        search={search}
        onSearchChange={(v) => { setSearch(v); resetPage(); }}
        searchPlaceholder={t("searchByJobTitle")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        hasActiveFilters={status !== "all" || approvalStatus !== "all" || selectedEmployer !== "all" || selectedAgent !== "all" || selectedSuperAgent !== "all"}
        filterContent={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <label htmlFor="approvals-status" className="sr-only">{t("statusLabel")}</label>
              <SearchableSelect id="approvals-status" className="h-11 w-full rounded-xl border-border bg-card" options={STATUS_OPTIONS} value={status} onValueChange={(v) => { setStatus(v); resetPage(); }} placeholder={t("allStatuses")} />
            </div>
            <div>
              <label htmlFor="approvals-approval" className="sr-only">{t("approvalLabel")}</label>
              <SearchableSelect id="approvals-approval" className="h-11 w-full rounded-xl border-border bg-card" options={APPROVAL_OPTIONS} value={approvalStatus} onValueChange={(v) => { setApprovalStatus(v); resetPage(); }} placeholder={t("allApprovals")} />
            </div>
            {employers.length > 1 && (
              <div>
                <label htmlFor="approvals-employer" className="sr-only">{t("employerLabel")}</label>
                <SearchableSelect id="approvals-employer" className="h-11 w-full rounded-xl border-border bg-card" options={employers} value={selectedEmployer} onValueChange={(v) => { setSelectedEmployer(v); resetPage(); }} placeholder={t("allEmployers")} />
              </div>
            )}
            {agents.length > 1 && (
              <div>
                <label htmlFor="approvals-agent" className="sr-only">{t("agentLabel")}</label>
                <SearchableSelect id="approvals-agent" className="h-11 w-full rounded-xl border-border bg-card" options={agents} value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); resetPage(); }} placeholder={t("allAgents")} />
              </div>
            )}
            {superAgentsList.length > 1 && (
              <div>
                <label htmlFor="approvals-sa" className="sr-only">{t("superAgentLabel")}</label>
                <SearchableSelect id="approvals-sa" className="h-11 w-full rounded-xl border-border bg-card" options={superAgentsList} value={selectedSuperAgent} onValueChange={(v) => { setSelectedSuperAgent(v); resetPage(); }} placeholder={t("allSuperAgents")} />
              </div>
            )}
          </div>
        }
      />

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
          <p className="text-sm font-semibold text-foreground">{t("noJobsFound")}</p>
          <p className="text-sm text-muted-foreground">{t("adjustFiltersMessage")}</p>
        </div>
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                  <TableHead>{t("tableHeaderTitle")}</TableHead>
                  <TableHead>{t("tableHeaderEmployer")}</TableHead>
                  <TableHead>{t("tableHeaderPostedBy")}</TableHead>
                  <TableHead>{t("tableHeaderSuperAgent")}</TableHead>
                  <TableHead>{t("tableHeaderLocation")}</TableHead>
                  <TableHead>{t("tableHeaderStatus")}</TableHead>
                  <TableHead>{t("tableHeaderApproval")}</TableHead>
                  <TableHead className="text-right">{t("tableHeaderApps")}</TableHead>
                  <TableHead>{t("tableHeaderPosted")}</TableHead>
                  <TableHead className="text-center">{t("tableHeaderView")}</TableHead>
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
                    <TableCell className="text-xs text-muted-foreground">{getAgentName(job) ?? t("employer")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getSuperAgentName(job) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatLocation(job.location)}</TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell><StatusBadge status={getApproval(job)} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">{job.applicantsCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedJob(job)}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">{t("viewDetails")}</span>
                        </Button>
                        {getApproval(job) === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                              disabled={actingId === job._id}
                              onClick={() => decideJob(job._id, true)}
                              title={tJobs("approve")}
                            >
                              <Check className="h-4 w-4" />
                              <span className="sr-only">{tJobs("approve")}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                              disabled={actingId === job._id}
                              onClick={() => decideJob(job._id, false)}
                              title={tJobs("reject")}
                            >
                              <X className="h-4 w-4" />
                              <span className="sr-only">{tJobs("reject")}</span>
                            </Button>
                          </>
                        )}
                      </div>
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
                <DialogDescription className="sr-only">{t("reviewDetailsAria")}</DialogDescription>
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
                  <Fact icon={MapPin} label={t("factLabelLocation")} value={formatLocation(selectedJob.location)} />
                  <Fact icon={DollarSign} label={t("factLabelSalary")} value={selectedJob.salary?.isNegotiable ? t("salaryNegotiable") : selectedJob.salary?.min ? `${selectedJob.salary.min.toLocaleString()} – ${selectedJob.salary.max?.toLocaleString()} ${selectedJob.salary.currency ?? ""}` : "—"} />
                  {selectedJob.employmentType && <Fact icon={Clock} label={t("factLabelType")} value={selectedJob.employmentType.replace(/_/g, " ")} />}
                  {selectedJob.workMode && <Fact icon={Globe} label={t("factLabelWorkMode")} value={selectedJob.workMode.replace(/_/g, " ")} />}
                  {(selectedJob.vacancies ?? 0) > 0 && <Fact icon={Users} label={t("factLabelVacancies")} value={String(selectedJob.vacancies)} />}
                  <Fact icon={Calendar} label={t("factLabelPosted")} value={new Date(selectedJob.createdAt).toLocaleDateString()} />
                  <Fact icon={UserCheck} label={t("factLabelPostedBy")} value={getAgentName(selectedJob) ?? t("employer")} />
                  {getSuperAgentName(selectedJob) && <Fact icon={UserCheck} label={t("factLabelSuperAgent")} value={getSuperAgentName(selectedJob)!} />}
                </div>

                {selectedJob.description && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("description")}</h4>
                    <p className="text-sm leading-relaxed text-foreground line-clamp-6">{selectedJob.description}</p>
                  </div>
                )}

                {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("requiredSkills")}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.requirements!.skills!.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedJob.requirements?.experience || selectedJob.requirements?.education) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedJob.requirements?.experience && <Fact icon={Briefcase} label={t("experience")} value={selectedJob.requirements.experience} />}
                    {selectedJob.requirements?.education && <Fact icon={FileText} label={t("education")} value={selectedJob.requirements.education} />}
                  </div>
                )}

                {(selectedJob.responsibilities?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("responsibilities")}</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
                      {selectedJob.responsibilities!.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}

                {(selectedJob.benefits?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("benefits")}</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
                      {selectedJob.benefits!.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}

                {getApproval(selectedJob) === "pending" && (
                  <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
                    <Button
                      variant="outline"
                      className="gap-1.5 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                      disabled={actingId === selectedJob._id}
                      onClick={() => decideJob(selectedJob._id, false)}
                    >
                      <X className="h-4 w-4" /> {tJobs("reject")}
                    </Button>
                    <Button
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      disabled={actingId === selectedJob._id}
                      onClick={() => decideJob(selectedJob._id, true)}
                    >
                      <Check className="h-4 w-4" /> {tJobs("approve")}
                    </Button>
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

function Fact({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
