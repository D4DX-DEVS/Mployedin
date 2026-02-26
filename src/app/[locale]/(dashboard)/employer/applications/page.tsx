"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { User, MapPin, Star, ChevronRight, ThumbsUp, ThumbsDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface Applicant {
  _id: string;
  jobId: { _id: string; title: string };
  jobSeekerId: { userId: string };
  status: string;
  aiMatchScore?: number;
  appliedAt: string;
  coverLetter?: string;
  matchBreakdown?: { skills: number; experience: number; overall: number };
}

const PIPELINE_STAGES = [
  { value: "applied", label: "Applied", color: "border-blue-400" },
  { value: "shortlisted", label: "Shortlisted", color: "border-amber-400" },
  { value: "interview_scheduled", label: "Interview", color: "border-purple-400" },
  { value: "selected", label: "Selected", color: "border-emerald-400" },
  { value: "rejected", label: "Rejected", color: "border-red-400" },
];

export default function EmployerApplicationsPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId") ?? "";
  const [applications, setApplications] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"kanban" | "table">("table");

  useEffect(() => {
    document.title = "Applications · MPLOYEDIN";
  }, []);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      if (jobId) params.set("jobId", jobId);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, jobId]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  async function updateApplicationStatus(id: string, status: string) {
    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchApplications();
  }

  const grouped = PIPELINE_STAGES.reduce<Record<string, Applicant[]>>((acc, stage) => {
    acc[stage.value] = applications.filter((a) => a.status === stage.value);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Applications"
        description={`${applications.length} total applicants${jobId ? " for this job" : ""}`}
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={view === "table" ? "default" : "outline"}
              onClick={() => setView("table")}
            >
              Table
            </Button>
            <Button
              size="sm"
              variant={view === "kanban" ? "default" : "outline"}
              onClick={() => setView("kanban")}
            >
              Kanban
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {PIPELINE_STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-base h-28 animate-pulse" />
          ))}
        </div>
      ) : view === "kanban" ? (
        <KanbanView grouped={grouped} onUpdateStatus={updateApplicationStatus} />
      ) : (
        <TableView applications={applications} onUpdateStatus={updateApplicationStatus} />
      )}
    </div>
  );
}

function KanbanView({
  grouped, onUpdateStatus
}: {
  grouped: Record<string, Applicant[]>;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 min-h-[400px]">
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage.value} className={`rounded-xl border-t-4 ${stage.color} bg-muted/20 p-3 space-y-2`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
            <Badge variant="secondary" className="text-xs">{grouped[stage.value]?.length ?? 0}</Badge>
          </div>
          {grouped[stage.value]?.map((app) => (
            <KanbanCard key={app._id} app={app} onUpdateStatus={onUpdateStatus} />
          ))}
          {!grouped[stage.value]?.length && (
            <p className="text-xs text-muted-foreground text-center py-4">Empty</p>
          )}
        </div>
      ))}
    </div>
  );
}

function KanbanCard({
  app, onUpdateStatus
}: {
  app: Applicant;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="bg-background rounded-lg border p-3 text-xs shadow-sm">
      <div className="flex items-center gap-1.5 mb-1.5">
        <User className="w-3 h-3 text-primary" />
        <span className="font-medium truncate">Job Seeker</span>
        {app.aiMatchScore != null && (
          <span className={`ms-auto font-bold ${app.aiMatchScore >= 70 ? "text-emerald-600" : "text-amber-600"}`}>
            {app.aiMatchScore}%
          </span>
        )}
      </div>
      <p className="text-muted-foreground truncate">{app.jobId?.title}</p>
      <div className="flex gap-1 mt-2">
        {app.status !== "selected" && (
          <button
            className="p-1 rounded hover:bg-emerald-100 text-emerald-600"
            onClick={() => onUpdateStatus(app._id, "shortlisted")}
            title="Shortlist"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
        )}
        {app.status !== "rejected" && (
          <button
            className="p-1 rounded hover:bg-red-100 text-red-600"
            onClick={() => onUpdateStatus(app._id, "rejected")}
            title="Reject"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        )}
        {app.status === "shortlisted" && (
          <button
            className="p-1 rounded hover:bg-purple-100 text-purple-600"
            onClick={() => onUpdateStatus(app._id, "interview_scheduled")}
            title="Schedule Interview"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function TableView({
  applications, onUpdateStatus
}: {
  applications: Applicant[];
  onUpdateStatus: (id: string, status: string) => void;
}) {
  if (!applications.length) {
    return (
      <div className="card-base text-center py-16">
        <User className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-semibold mb-1">No applications yet</h3>
        <p className="text-sm text-muted-foreground">Applications will appear here once candidates apply</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th className="text-start px-4 py-3">Applicant</th>
            <th className="text-start px-4 py-3">Job</th>
            <th className="text-start px-4 py-3">Status</th>
            <th className="text-start px-4 py-3">AI Match</th>
            <th className="text-start px-4 py-3">Applied</th>
            <th className="text-start px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {applications.map((app) => (
            <tr key={app._id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-medium">Candidate #{app._id.slice(-4)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground truncate max-w-[160px]">
                {app.jobId?.title}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={app.status} />
              </td>
              <td className="px-4 py-3">
                {app.aiMatchScore != null ? (
                  <span className={`font-semibold ${app.aiMatchScore >= 70 ? "text-emerald-600" : app.aiMatchScore >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {app.aiMatchScore}%
                  </span>
                ) : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {new Date(app.appliedAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {app.status === "applied" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => onUpdateStatus(app._id, "shortlisted")}>
                      Shortlist
                    </Button>
                  )}
                  {app.status === "shortlisted" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => onUpdateStatus(app._id, "interview_scheduled")}>
                      <Calendar className="w-3 h-3 me-1" /> Interview
                    </Button>
                  )}
                  {app.status === "interview_scheduled" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600"
                      onClick={() => onUpdateStatus(app._id, "selected")}>
                      Select
                    </Button>
                  )}
                  {!["rejected", "selected"].includes(app.status) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                      onClick={() => onUpdateStatus(app._id, "rejected")}>
                      Reject
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
