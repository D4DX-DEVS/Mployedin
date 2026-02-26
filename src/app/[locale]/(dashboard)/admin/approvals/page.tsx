"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, Eye, Briefcase, MapPin, Building2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";

interface Job {
  _id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  salary: { min: number; max: number; currency: string };
  requirements: { skills: string[] };
  employerId?: { companyName?: string; country?: string };
  agentId?: string;
  "poster.approvalStatus": "pending" | "approved" | "rejected";
  status: string;
  createdAt: string;
}

export default function AdminApprovalsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");

  useEffect(() => { document.title = "Approvals · MPLOYEDIN"; }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all jobs for admin review
      const params = new URLSearchParams({ limit: "100", myJobs: "true" });
      const res = await fetch(`/api/admin/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function approveJob(jobId: string, approved: boolean) {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "poster.approvalStatus": approved ? "approved" : "rejected",
        status: approved ? "active" : "closed",
      }),
    });
    if (res.ok) fetchJobs();
  }

  const pending = jobs.filter((j) => j["poster.approvalStatus"] === "pending");
  const approved = jobs.filter((j) => j["poster.approvalStatus"] === "approved");
  const rejected = jobs.filter((j) => j["poster.approvalStatus"] === "rejected");

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Approvals Queue"
        description="Review and approve job postings before they go live"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending <Badge className="ms-1.5 bg-amber-100 text-amber-700 border-amber-200 text-xs">{pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved <Badge className="ms-1.5 bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{approved.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected <Badge className="ms-1.5 bg-red-100 text-red-700 border-red-200 text-xs">{rejected.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {[
          { value: "pending", jobs: pending },
          { value: "approved", jobs: approved },
          { value: "rejected", jobs: rejected },
        ].map(({ value, jobs: tabJobs }) => (
          <TabsContent key={value} value={value} className="mt-4">
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card-base h-32 animate-pulse" />
                ))}
              </div>
            ) : tabJobs.length === 0 ? (
              <div className="card-base text-center py-16">
                <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No {value} jobs</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tabJobs.map((job) => (
                  <JobApprovalCard
                    key={job._id}
                    job={job}
                    showActions={value === "pending"}
                    onApprove={() => approveJob(job._id, true)}
                    onReject={() => approveJob(job._id, false)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function JobApprovalCard({
  job, showActions, onApprove, onReject
}: {
  job: Job;
  showActions: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const posted = new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="card-base space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold">{job.title}</h3>
            {job.category && <Badge variant="secondary" className="text-xs">{job.category}</Badge>}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {job.employerId?.companyName && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {job.employerId.companyName}
              </span>
            )}
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {job.location}
              </span>
            )}
            {job.salary?.min > 0 && (
              <span>{job.salary.min.toLocaleString()} – {job.salary.max.toLocaleString()} {job.salary.currency}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Submitted {posted}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            <Eye className="w-3.5 h-3.5 me-1" /> {expanded ? "Hide" : "Preview"}
          </Button>
          {showActions && (
            <>
              <Button size="sm" onClick={onApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle className="w-3.5 h-3.5 me-1" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={onReject}>
                <XCircle className="w-3.5 h-3.5 me-1" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Skills */}
      {job.requirements?.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.requirements.skills.slice(0, 6).map((s) => (
            <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
          ))}
        </div>
      )}

      {/* Description preview */}
      {expanded && job.description && (
        <div className="pt-2 border-t text-sm text-muted-foreground leading-relaxed">
          {job.description}
        </div>
      )}
    </div>
  );
}
