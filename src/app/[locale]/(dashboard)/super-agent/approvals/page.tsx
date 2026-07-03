"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Briefcase, Building2, Calendar, Eye, Globe, Loader2,
  MapPin, Search, DollarSign, GraduationCap,
  Clock, Users, X, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

type JobStatus = "all" | "active" | "draft" | "closed" | "expired" | "pending_approval";

interface RegionalJob {
  _id: string;
  title: string;
  status: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  createdAt: string;
  employerId?: { name?: string; companyName?: string };
  agentId?: { userId?: string };
  postedByAgent?: { name?: string };
  poster?: { approvalStatus?: string };
}

interface JobDetail {
  _id: string;
  title: string;
  description: string;
  status?: string;
  category?: string;
  location: { isRemote?: boolean; city?: string; country?: string } | string;
  salary: { min?: number; max?: number; currency?: string; isNegotiable?: boolean; period?: string };
  requirements: { skills?: string[]; preferredSkills?: string[]; experienceMin?: number; experienceMax?: number; education?: string; languages?: string[]; nationality?: string[] };
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  tags?: string[];
  employerId?: { companyName?: string; country?: string; industry?: string };
  createdAt: string;
  expiresAt?: string;
  views?: number;
  poster?: { approvalStatus?: string };
}

interface JobCounts {
  total: number;
  active: number;
  draft: number;
  closed: number;
  expired: number;
  pendingApproval: number;
  employers: number;
}

export default function SuperAgentApprovalsPage() {
  const t = useTranslations("superAgentApprovals");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const [jobs, setJobs] = useState<RegionalJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [jobStatus, setJobStatus] = useState<JobStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Counts from API
  const [counts, setCounts] = useState<JobCounts>({ total: 0, active: 0, draft: 0, closed: 0, expired: 0, pendingApproval: 0, employers: 0 });

  // Pagination
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination(20);

  // Detail dialog state
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadJobs = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (jobStatus !== "all") p.set("status", jobStatus);
      p.set("page", String(page));
      p.set("limit", String(limit));
      const q = search ?? searchQuery;
      if (q) p.set("search", q);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);

      const res = await fetch(`/api/super-agent/approvals?${p}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
        if (data.counts) setCounts(data.counts);
        if (data.pagination) updateTotal(data.pagination.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [jobStatus, searchQuery, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    resetPage();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadJobs(value), 400);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setJobStatus("all");
    setDateFrom("");
    setDateTo("");
    resetPage();
  };

  const hasFilters = !!(searchQuery || dateFrom || dateTo || jobStatus !== "all");

  const openDetail = async (jobId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setSelectedJob(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data.job ?? null);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const [approving, setApproving] = useState(false);
  const handleApproval = async (status: "approved" | "rejected") => {
    if (!selectedJob) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/super-agent/approvals/${selectedJob._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setDetailOpen(false);
        loadJobs();
      }
    } finally {
      setApproving(false);
    }
  };

  // Inline approve/reject directly from a table row (no need to open the dialog).
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const handleRowApproval = async (jobId: string, status: "approved" | "rejected") => {
    setRowActionId(jobId);
    try {
      const res = await fetch(`/api/super-agent/approvals/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) loadJobs();
    } finally {
      setRowActionId(null);
    }
  };

  const formatLocation = (loc: string | { isRemote?: boolean; city?: string; country?: string } | undefined) => {
    if (!loc) return "—";
    if (typeof loc === "string") return loc || "—";
    if (loc.isRemote) return "Remote";
    return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
  };

  const kpis = [
    {
      label: t("kpiPendingApprovalLabel"),
      value: counts.pendingApproval,
      helper: t("kpiPendingApprovalHelper"),
      icon: <Clock className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: t("kpiTotalJobsLabel"),
      value: counts.total,
      helper: t("kpiTotalJobsHelper"),
      icon: <Briefcase className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: tc("active"),
      value: counts.active,
      helper: t("kpiActiveHelper"),
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: t("kpiEmployersLabel"),
      value: counts.employers,
      helper: t("kpiEmployersHelper"),
      icon: <Building2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
  ];

  const tableHeaders = [t("tableHeaderJobTitle"), t("tableHeaderEmployer"), t("tableHeaderPostedBy"), t("tableHeaderLocation"), tc("status"), tc("date"), ""];

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderJobTitle"), key: "title" },
    { header: t("tableHeaderEmployer"), key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string; name?: string })?.companyName ?? (row.employerId as { name?: string })?.name ?? "" },
    { header: t("tableHeaderPostedBy"), key: "postedByAgent", formatter: (_v, row) => (row.postedByAgent as { name?: string })?.name ?? t("defaultEmployer") },
    { header: t("tableHeaderLocation"), key: "location", formatter: (_v, row) => formatLocation((row as unknown as RegionalJob).location) },
    { header: tc("status"), key: "status" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-approvals",
    title: "Regional Jobs",
  });

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        summaryTitle={t("approvalGateTitle")}
        summaryDescription={t("approvalGateDescription")}
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow={t("sectionEyebrow")}
        title={t("sectionTitle")}
        description={t("sectionDescription")}
      >
        {/* Filter controls + Export */}
        <TableToolbar
          search={searchQuery}
          onSearchChange={handleSearchChange}
          searchPlaceholder={t("searchPlaceholder")}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={hasFilters}
          actions={hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" /> {t("clearFilters")}
            </Button>
          ) : undefined}
          filterContent={
            <div className="flex flex-wrap items-center gap-3">
              <Select value={jobStatus} onValueChange={(v) => { setJobStatus(v as JobStatus); resetPage(); }}>
                <SelectTrigger className="h-11 w-[160px] rounded-xl border-border bg-card text-sm">
                  <SelectValue placeholder={t("statusFilterPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("statusFilterAll")}</SelectItem>
                  <SelectItem value="pending_approval">{t("statusFilterPendingApproval")}</SelectItem>
                  <SelectItem value="active">{tc("active")}</SelectItem>
                  <SelectItem value="draft">{t("statusFilterDraft")}</SelectItem>
                  <SelectItem value="closed">{t("statusFilterClosed")}</SelectItem>
                  <SelectItem value="expired">{t("statusFilterExpired")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">{t("dateFromLabel")}</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-11 w-[160px] rounded-xl border-border bg-card text-sm shadow-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">{t("dateToLabel")}</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-11 w-[160px] rounded-xl border-border bg-card text-sm shadow-none"
                />
              </div>
            </div>
          }
          className="mb-4"
        />

        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  {tableHeaders.map((h, i) => (
                    <TableHead key={i} className={i === tableHeaders.length - 1 ? "text-right" : ""}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {tableHeaders.map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                <Briefcase className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{t("noJobsFound")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("noJobsFoundHint")}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>{t("tableHeaderJobTitle")}</TableHead>
                  <TableHead>{t("tableHeaderEmployer")}</TableHead>
                  <TableHead>{t("tableHeaderPostedBy")}</TableHead>
                  <TableHead>{t("tableHeaderLocation")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead>{tc("date")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const isPending = job.poster?.approvalStatus === "pending";
                  return (
                  <TableRow key={job._id} className="bg-transparent">
                    <TableCell className="font-medium text-foreground">{job.title}</TableCell>
                    <TableCell className="text-muted-foreground">{job.employerId?.companyName ?? job.employerId?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{job.postedByAgent?.name ?? t("defaultEmployer")}</TableCell>
                    <TableCell className="text-muted-foreground">{formatLocation(job.location)}</TableCell>
                    <TableCell>
                      {isPending ? (
                        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{t("statusPendingApproval")}</Badge>
                      ) : (
                        <StatusBadge status={job.status ?? "draft"} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={rowActionId === job._id}
                              onClick={() => handleRowApproval(job._id, "approved")}
                            >
                              {rowActionId === job._id ? "…" : t("approveButtonLabel")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              disabled={rowActionId === job._id}
                              onClick={() => handleRowApproval(job._id, "rejected")}
                            >
                              {t("rejectButtonLabel")}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title={t("viewJobDetailsTitle")}
                          onClick={() => openDetail(job._id)}
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination controls */}
        {!loading && jobs.length > 0 && (
          <div className="border-t border-border/60 px-4 py-3 sm:px-5">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </div>
        )}
      </SuperAgentSection>

      {/* ── Job Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto gap-5 p-6">
          {detailLoading ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{t("loadingJobDetails")}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : selectedJob ? (
            <>
              <DialogHeader className="space-y-2 pr-8">
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="text-xl font-semibold leading-tight">{selectedJob.title}</DialogTitle>
                  <StatusBadge status={selectedJob.status ?? "draft"} />
                </div>
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {selectedJob.employerId?.companyName && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" /> {selectedJob.employerId.companyName}
                      </span>
                    )}
                    {selectedJob.category && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> {selectedJob.category}
                      </span>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>

              {/* Key facts row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {/* Location */}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("detailLocation")}</p>
                    <p className="font-medium text-foreground">{formatLocation(selectedJob.location)}</p>
                  </div>
                </div>
                {/* Salary */}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("detailSalary")}</p>
                    <p className="font-medium text-foreground">
                      {selectedJob.salary?.isNegotiable
                        ? t("salaryNegotiable")
                        : selectedJob.salary?.min && selectedJob.salary?.max
                          ? `${selectedJob.salary.min.toLocaleString()}–${selectedJob.salary.max.toLocaleString()} ${selectedJob.salary.currency ?? ""}`
                          : "—"}
                    </p>
                  </div>
                </div>
                {/* Employment Type */}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("detailType")}</p>
                    <p className="font-medium text-foreground capitalize">
                      {selectedJob.employmentType?.replace("_", " ") ?? "—"}
                    </p>
                  </div>
                </div>
                {/* Work Mode */}
                {selectedJob.workMode && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Globe className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("detailWorkMode")}</p>
                      <p className="font-medium text-foreground capitalize">{selectedJob.workMode}</p>
                    </div>
                  </div>
                )}
                {/* Vacancies */}
                {selectedJob.vacancies && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("detailVacancies")}</p>
                      <p className="font-medium text-foreground">{selectedJob.vacancies}</p>
                    </div>
                  </div>
                )}
                {/* Posted */}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("detailPosted")}</p>
                    <p className="font-medium text-foreground">{new Date(selectedJob.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("detailDescription")}</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-6">
                    {selectedJob.description}
                  </p>
                </div>
              )}

              {/* Skills */}
              {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("detailRequiredSkills")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJob.requirements.skills!.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience & Education */}
              {(selectedJob.requirements?.experienceMin != null || selectedJob.requirements?.education) && (
                <div className="flex flex-wrap gap-4 text-sm">
                  {selectedJob.requirements.experienceMin != null && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      {t("experienceRange", { min: selectedJob.requirements.experienceMin, max: selectedJob.requirements.experienceMax ?? "?" })}
                    </span>
                  )}
                  {selectedJob.requirements.education && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {selectedJob.requirements.education}
                    </span>
                  )}
                </div>
              )}

              {/* Responsibilities */}
              {(selectedJob.responsibilities?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("detailResponsibilities")}</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                    {selectedJob.responsibilities!.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {/* Benefits */}
              {(selectedJob.benefits?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("detailBenefits")}</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                    {selectedJob.benefits!.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}

              {/* Approve / Reject Actions */}
              {selectedJob.poster?.approvalStatus === "pending" && (
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Button
                    onClick={() => handleApproval("approved")}
                    disabled={approving}
                    className="flex-1"
                  >
                    {approving ? t("processingEllipsis") : t("approvePublishButtonLabel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleApproval("rejected")}
                    disabled={approving}
                    className="flex-1"
                  >
                    {t("rejectButtonLabel")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{t("jobDetailsUnavailable")}</DialogTitle>
              </DialogHeader>
              <div className="py-16 text-center text-sm text-muted-foreground">
                {t("failedToLoadJobDetails")}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
