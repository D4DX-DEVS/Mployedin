"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Eye, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface JobApproval {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  approvalStatus: string;
  createdAt: string;
  employerId?: { name?: string; companyName?: string };
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

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: action }),
      });
      await loadJobs();
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Regional Job Approvals"
        description="Review and approve job postings within your region before they go live"
      />

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["pending","approved","rejected"].map((s) => (
          <Button
            key={s}
            onClick={() => setFilter(s)}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        {loading ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Job Title</TableHead>
                <TableHead>Employer</TableHead>
                <TableHead>Posted By</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-3/4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No {filter} approvals in your region</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Job Title</TableHead>
                <TableHead>Employer</TableHead>
                <TableHead>Posted By</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job._id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.employerId?.companyName ?? job.employerId?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.postedByAgent?.name ?? "Employer"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{typeof job.location === "object" && job.location ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ") || "—") : (job.location ?? "—")}</TableCell>
                  <TableCell>
                    <StatusBadge status={job.approvalStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View details" onClick={() => {}}>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {filter === "pending" && (
                        <>
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                            onClick={() => handleAction(job._id, "approved")}
                            disabled={processingId === job._id}
                            title="Approve"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
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
      </div>
    </div>
  );
}
