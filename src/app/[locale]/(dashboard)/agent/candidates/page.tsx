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
  Users, Search, Loader2, Inbox, Star,
} from "lucide-react";
import { useSearchParams, usePathname } from "next/navigation";

interface ApplicationItem {
  _id: string;
  status: string;
  aiMatchScore?: number;
  appliedAt?: string;
  createdAt: string;
  jobId?: {
    _id: string;
    title: string;
    location?: { city?: string; country?: string };
  };
  jobSeekerId?: {
    _id: string;
    userId?: { name?: string };
    skills?: string[];
    totalExperienceYears?: number;
  };
  otherApplicationsCount?: number;
}

const STATUS_OPTIONS = [
  "", "applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected",
];

export default function AgentCandidatesPage() {
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("jobId") ?? "";

  const pagination = usePagination();
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState(initialJobId);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (statusFilter) params.set("status", statusFilter);
      if (jobIdFilter) params.set("jobId", jobIdFilter);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications ?? []);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, jobIdFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadApplications, 300);
    return () => clearTimeout(t);
  }, [loadApplications]);

  useEffect(() => { pagination.resetPage(); }, [statusFilter, jobIdFilter]);

  const handleStatusUpdate = async (appId: string, newStatus: string) => {
    setUpdatingId(appId);
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await loadApplications();
    } finally {
      setUpdatingId(null);
    }
  };

  const matchScoreColor = (score?: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-500";
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Candidates"
        description="All candidates across your managed jobs — review, shortlist, and manage the pipeline"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {jobIdFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJobIdFilter("")}
            className="text-xs"
          >
            ✕ Clear job filter
          </Button>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s}
              onClick={() => setStatusFilter(s)}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="capitalize text-xs"
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
        ) : applications.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No candidates found</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Candidate</TableHead>
                <TableHead>Job Applied To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI Match</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app._id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">
                        {app.jobSeekerId?.userId?.name ?? "Unknown"}
                      </p>
                      {app.jobSeekerId?.totalExperienceYears != null && (
                        <p className="text-xs text-muted-foreground">
                          {app.jobSeekerId.totalExperienceYears}y exp
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {app.jobId?.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={app.status} />
                  </TableCell>
                  <TableCell>
                    <div className={`flex items-center gap-1 text-sm font-medium ${matchScoreColor(app.aiMatchScore)}`}>
                      <Star className="h-3.5 w-3.5" />
                      {app.aiMatchScore != null ? `${app.aiMatchScore}%` : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {app.status === "applied" && (
                        <Button
                          variant="outline" size="sm" className="text-xs h-7"
                          disabled={updatingId === app._id}
                          onClick={() => handleStatusUpdate(app._id, "shortlisted")}
                        >
                          Shortlist
                        </Button>
                      )}
                      {(app.status === "applied" || app.status === "shortlisted") && (
                        <Button
                          variant="outline" size="sm" className="text-xs h-7"
                          disabled={updatingId === app._id}
                          onClick={() => handleStatusUpdate(app._id, "interview_scheduled")}
                        >
                          Schedule
                        </Button>
                      )}
                      {app.status !== "rejected" && app.status !== "hired" && (
                        <Button
                          variant="ghost" size="sm" className="text-xs h-7 text-red-500 hover:text-red-600"
                          disabled={updatingId === app._id}
                          onClick={() => handleStatusUpdate(app._id, "rejected")}
                        >
                          Reject
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
