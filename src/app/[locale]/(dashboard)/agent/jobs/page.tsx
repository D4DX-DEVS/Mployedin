"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarRange,
  Inbox,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Edit2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface JobItem {
  _id: string;
  title: string;
  status: string;
  poster?: { approvalStatus?: string };
  location?: { city?: string; country?: string; isRemote?: boolean };
  category?: string;
  vacancies?: number;
  applicantIds?: string[];
  employerId?: { companyName?: string };
  createdAt: string;
}

export default function AgentJobsPage() {
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const pagination = usePagination();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadJobs, 300);
    return () => clearTimeout(t);
  }, [loadJobs]);

  useEffect(() => { pagination.resetPage(); }, [search, statusFilter]);

  const handleCloseJob = async (id: string) => {
    if (!confirm("Close this job? It will no longer accept applications.")) return;
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    loadJobs();
  };

  const locationText = (loc?: JobItem["location"]) => {
    if (!loc) return "—";
    if (loc.isRemote) return "Remote";
    return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
  };

  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const draftJobs = jobs.filter((job) => job.status === "draft").length;
  const pendingApprovals = jobs.filter((job) => (job.poster?.approvalStatus ?? "pending") === "pending").length;
  const totalApplicants = jobs.reduce((sum, job) => sum + (job.applicantIds?.length ?? 0), 0);

  const summaryCards = [
    {
      label: "Active",
      value: activeJobs,
      description: "Roles currently open for applications.",
      icon: ShieldCheck,
      tone: "workspace-tone-emerald",
    },
    {
      label: "Drafts",
      value: draftJobs,
      description: "Jobs waiting for review or completion.",
      icon: BriefcaseBusiness,
      tone: "workspace-tone-amber",
    },
    {
      label: "Pending approval",
      value: pendingApprovals,
      description: "Posts that still need a decision upstream.",
      icon: CalendarRange,
      tone: "workspace-tone-sky",
    },
    {
      label: "Applicants",
      value: totalApplicants,
      description: "Candidate volume across the current results.",
      icon: Users,
      tone: "workspace-tone-indigo",
    },
  ];

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Managed Job Board
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review the jobs you own directly or through assigned employers, keep approvals moving, and jump into candidates without leaving the same workspace.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} tracked jobs</p>
              <p className="text-xs text-muted-foreground">Draft, live, and closed roles inside your current queue.</p>
            </div>
            <Link href={`/${locale}/agent/jobs/new`}>
              <Button className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" />
                Post Job
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.label} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
                  </div>
                  <div className={`rounded-2xl p-2.5 ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse roles</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter the jobs you need to act on next</h2>
            <p className="mt-1 text-sm text-muted-foreground">Search by title or narrow the queue to the status you want to work through.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs"
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["", "draft", "active", "closed"].map((value) => {
              const isSelected = statusFilter === value;

              return (
                <Button
                  key={value || "all"}
                  onClick={() => setStatusFilter(value)}
                  variant="outline"
                  size="sm"
                  className={isSelected
                    ? "h-11 rounded-xl border-primary/20 bg-primary/10 px-4 text-primary hover:bg-primary/15"
                    : "h-11 rounded-xl border-border bg-secondary/65 px-4 text-muted-foreground hover:bg-card"
                  }
                >
                  {value || "All"}
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Keep each role moving from posting to placement</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-sky-600" />
            {pagination.total} jobs across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-border bg-card">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <Inbox className="h-8 w-8 text-muted-foreground/55" />
                <p className="text-sm font-medium text-foreground">No jobs found</p>
                <p className="text-sm text-muted-foreground">Try adjusting the filters or create a new role.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/70 hover:bg-secondary/70">
                  <TableHead>Job Title</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id} className="hover:bg-secondary/60">
                    <TableCell className="font-medium text-foreground">{job.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.employerId?.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {locationText(job.location)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.poster?.approvalStatus ?? "pending"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.applicantIds?.length ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/${locale}/agent/candidates?jobId=${job._id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 rounded-xl px-2.5"
                            title="View Candidates"
                            aria-label={`View candidates for ${job.title}`}
                          >
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </Link>
                        <Link href={`/${locale}/agent/jobs/new?edit=${job._id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 rounded-xl px-2.5"
                            title="Edit"
                            aria-label={`Edit ${job.title}`}
                          >
                            <Edit2 className="h-4 w-4 text-sky-600" />
                          </Button>
                        </Link>
                        {job.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 rounded-xl px-2.5"
                            onClick={() => handleCloseJob(job._id)}
                            title="Close Job"
                            aria-label={`Close ${job.title}`}
                          >
                            <XCircle className="h-4 w-4 text-rose-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
    </div>
  );
}
