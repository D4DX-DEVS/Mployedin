"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Briefcase, Building2, Calendar, CheckCircle, Eye, Globe, Loader2,
  MapPin, Search, ShieldCheck, XCircle, XOctagon, DollarSign, GraduationCap,
  Clock, Users, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
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

interface JobDetail {
  _id: string;
  title: string;
  description: string;
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
  poster?: { approvalStatus?: string };
  employerId?: { companyName?: string; country?: string; industry?: string };
  createdAt: string;
  expiresAt?: string;
  views?: number;
}

export default function SuperAgentApprovalsPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const [jobs, setJobs] = useState<JobApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");

  // Counts from API (cross-status)
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pagination
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination(20);

  // Detail dialog state
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadJobs = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ status: filter });
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
  }, [filter, searchQuery, dateFrom, dateTo, page, limit, updateTotal]);

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
    setDateFrom("");
    setDateTo("");
    resetPage();
  };

  const hasFilters = searchQuery || dateFrom || dateTo;

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
      setDetailOpen(false);
      setSelectedJob(null);
      await loadJobs();
    } finally {
      setProcessingId(null);
    }
  };

  const employerCount = new Set(jobs.map((job) => job.employerId?.companyName ?? job.employerId?.name).filter(Boolean)).size;

  const kpis = [
    {
      label: "Pending",
      value: counts.pending,
      helper: "Jobs awaiting your review.",
      icon: <ShieldCheck className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Approved",
      value: counts.approved,
      helper: "Jobs approved and live.",
      icon: <CheckCircle className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Rejected",
      value: counts.rejected,
      helper: "Jobs declined and may need revision.",
      icon: <XOctagon className="h-5 w-5" />,
      toneClassName: "workspace-tone-rose",
    },
    {
      label: "Employers",
      value: employerCount,
      helper: "Distinct employers in the current view.",
      icon: <Eye className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
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
        {/* Status tabs + filter controls */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["pending", "approved", "rejected"] as const).map((s) => (
              <Button
                key={s}
                onClick={() => { setFilter(s); resetPage(); }}
                aria-pressed={filter === s}
                variant={filter === s ? "default" : "outline"}
                size="sm"
                className={`rounded-xl capitalize ${filter === s ? "" : "border-border/70 bg-background/85 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"}`}
              >
                {s}
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {counts[s]}
                </Badge>
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search job title or employer…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[140px] text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[140px] text-sm"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground">
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        <SuperAgentDataTableShell>
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/60 bg-secondary/65 hover:bg-secondary/65">
                  <TableHead className="py-4 text-muted-foreground/80">Job Title</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Employer</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Posted By</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Location</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Status</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Date</TableHead>
                  <TableHead className="py-4 text-right text-muted-foreground/80">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-muted/75" /></TableCell>
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
                <TableRow className="border-b border-border/60 bg-secondary/65 hover:bg-secondary/65">
                  <TableHead className="py-4 text-muted-foreground/80">Job Title</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Employer</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Posted By</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Location</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Status</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Date</TableHead>
                  <TableHead className="py-4 text-right text-muted-foreground/80">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id} className="border-border/50 hover:bg-accent/25">
                    <TableCell className="py-4 font-medium text-foreground">{job.title}</TableCell>
                    <TableCell className="py-4 text-muted-foreground">{job.employerId?.companyName ?? job.employerId?.name ?? "—"}</TableCell>
                    <TableCell className="py-4 text-muted-foreground">{job.postedByAgent?.name ?? "Employer"}</TableCell>
                    <TableCell className="py-4 text-muted-foreground">{typeof job.location === "object" && job.location ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ") || "—") : (job.location ?? "—")}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={job.poster?.approvalStatus ?? "pending"} /></TableCell>
                    <TableCell className="py-4 text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="View job details"
                          onClick={() => openDetail(job._id)}
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
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
                <DialogTitle>Loading job details</DialogTitle>
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
                  <StatusBadge status={selectedJob.poster?.approvalStatus ?? "pending"} />
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
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium text-foreground">
                      {typeof selectedJob.location === "object" && selectedJob.location
                        ? selectedJob.location.isRemote
                          ? "Remote"
                          : [selectedJob.location.city, selectedJob.location.country].filter(Boolean).join(", ") || "—"
                        : (selectedJob.location ?? "—")}
                    </p>
                  </div>
                </div>
                {/* Salary */}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Salary</p>
                    <p className="font-medium text-foreground">
                      {selectedJob.salary?.isNegotiable
                        ? "Negotiable"
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
                    <p className="text-xs text-muted-foreground">Type</p>
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
                      <p className="text-xs text-muted-foreground">Work Mode</p>
                      <p className="font-medium text-foreground capitalize">{selectedJob.workMode}</p>
                    </div>
                  </div>
                )}
                {/* Vacancies */}
                {selectedJob.vacancies && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Vacancies</p>
                      <p className="font-medium text-foreground">{selectedJob.vacancies}</p>
                    </div>
                  </div>
                )}
                {/* Posted */}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Posted</p>
                    <p className="font-medium text-foreground">{new Date(selectedJob.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Description</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-6">
                    {selectedJob.description}
                  </p>
                </div>
              )}

              {/* Skills */}
              {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Required Skills</h4>
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
                      {selectedJob.requirements.experienceMin}–{selectedJob.requirements.experienceMax ?? "?"} yrs
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
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Responsibilities</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                    {selectedJob.responsibilities!.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {/* Benefits */}
              {(selectedJob.benefits?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Benefits</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                    {selectedJob.benefits!.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}

              {/* Action buttons (only when pending) */}
              {selectedJob.poster?.approvalStatus === "pending" && (
                <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t border-border/60 bg-background px-6 py-4">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleAction(selectedJob._id, "approved")}
                    disabled={processingId === selectedJob._id}
                  >
                    {processingId === selectedJob._id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleAction(selectedJob._id, "rejected")}
                    disabled={processingId === selectedJob._id}
                  >
                    {processingId === selectedJob._id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Reject
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>Job details unavailable</DialogTitle>
              </DialogHeader>
              <div className="py-16 text-center text-sm text-muted-foreground">
                Failed to load job details.
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
