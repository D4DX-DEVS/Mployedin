"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CheckCircle, XCircle, Eye, Loader2 } from "lucide-react";

interface JobApproval {
  _id: string;
  title: string;
  location: string;
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Regional Job Approvals"
        description="Review and approve job postings within your territory before they go live"
      />

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["pending","approved","rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              filter === s ? "bg-primary text-white" : "bg-muted/40 hover:bg-muted/60"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No {filter} approvals in your territory
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/20">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Job Title</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Employer</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Posted By</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Location</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Date</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job._id} className="border-b hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-medium">{job.title}</td>
                    <td className="p-3 text-muted-foreground">
                      {job.employerId?.companyName ?? job.employerId?.name ?? "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {job.postedByAgent?.name ?? "Employer"}
                    </td>
                    <td className="p-3 text-muted-foreground">{job.location}</td>
                    <td className="p-3">
                      <StatusBadge status={job.approvalStatus} />
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {}}
                          className="p-1.5 rounded-lg hover:bg-muted/40"
                          title="View details"
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </button>
                        {filter === "pending" && (
                          <>
                            <button
                              onClick={() => handleAction(job._id, "approved")}
                              disabled={processingId === job._id}
                              className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
                              title="Approve"
                            >
                              {processingId === job._id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <CheckCircle className="h-4 w-4" />
                              }
                            </button>
                            <button
                              onClick={() => handleAction(job._id, "rejected")}
                              disabled={processingId === job._id}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                              title="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
