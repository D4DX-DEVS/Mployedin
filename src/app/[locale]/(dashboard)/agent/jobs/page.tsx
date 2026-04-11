"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Briefcase, Search, Loader2, Plus, Users, Eye, Edit2, XCircle, Inbox,
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

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <PageHeader
          title="My Jobs"
          description="Jobs you manage — posted by you or your assigned employers"
        />
        <Link href={`/${locale}/agent/jobs/new`}>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Post Job
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="input-field w-full sm:w-64 pl-9 pr-4"
          />
        </div>
        <div className="flex gap-1.5">
          {["", "draft", "active", "closed"].map((s) => (
            <Button
              key={s}
              onClick={() => setStatusFilter(s)}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="capitalize"
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No jobs found</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
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
                <TableRow key={job._id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
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
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/${locale}/agent/candidates?jobId=${job._id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Candidates">
                          <Users className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </Link>
                      <Link href={`/${locale}/agent/jobs/new?edit=${job._id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit">
                          <Edit2 className="h-4 w-4 text-blue-600" />
                        </Button>
                      </Link>
                      {job.status === "active" && (
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => handleCloseJob(job._id)}
                          title="Close Job"
                        >
                          <XCircle className="h-4 w-4 text-red-500" />
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
