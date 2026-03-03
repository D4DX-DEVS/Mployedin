"use client";

import { useEffect, useState } from "react";
import { FileText, MapPin, Calendar, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

interface ApplicationJob {
  _id: string;
  title: string;
  location: string;
  salary?: { min: number; max: number; currency: string };
  employerId?: string;
}

interface Application {
  _id: string;
  jobId: ApplicationJob;
  status: string;
  aiMatchScore?: number;
  appliedAt: string;
  coverLetter?: string;
  statusHistory: Array<{ status: string; changedAt: string; note?: string }>;
}

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview_scheduled", label: "Interview" },
  { value: "selected", label: "Selected" },
  { value: "rejected", label: "Rejected" },
];

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const pagination = usePagination();

  useEffect(() => {
    document.title = "My Applications · MPLOYEDIN";
  }, []);

  useEffect(() => {
    fetchApplications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pagination.page, pagination.limit]);

  async function fetchApplications() {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (activeTab !== "all") params.set("status", activeTab);

      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(val: string) {
    setActiveTab(val);
    pagination.resetPage();
  }

  return (
    <div className="page-container">
      <PageHeader
        title="My Applications"
        description={`${pagination.total} total applications`}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="card-base animate-pulse h-24" />
                ))}
              </div>
            ) : applications.length === 0 ? (
              <div className="card-base text-center py-16">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No applications here</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t === STATUS_TABS[0]
                    ? "You haven't applied to any jobs yet"
                    : `No applications with status: ${t.label}`}
                </p>
                <Button size="sm" onClick={() => window.location.href = "../job-seeker/jobs"}>
                  Browse Jobs
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <ApplicationCard key={app._id} app={app} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

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

function ApplicationCard({ app }: { app: Application }) {
  const job = app.jobId;
  const appliedDate = new Date(app.appliedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });

  return (
    <div className="card-base hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-foreground">{job?.title ?? "Job"}</h3>
            <StatusBadge status={app.status} />
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {job?.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {job.location}
              </span>
            )}
            {job?.salary?.min && (
              <span className="flex items-center gap-1">
                {job.salary.min.toLocaleString()} – {job.salary.max.toLocaleString()} {job.salary.currency}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Applied {appliedDate}
            </span>
          </div>

          {/* Status timeline mini */}
          {app.statusHistory?.length > 1 && (
            <div className="flex items-center gap-1 mt-3 flex-wrap">
              {app.statusHistory.slice(-3).map((h, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                  {i > 0 && <ChevronRight className="w-3 h-3" />}
                  <StatusBadge status={h.status} size="sm" />
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AI match score */}
        {app.aiMatchScore != null && app.aiMatchScore > 0 && (
          <div className="shrink-0 text-center">
            <div className={`text-lg font-bold ${app.aiMatchScore >= 70 ? "text-emerald-600" : app.aiMatchScore >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
              {app.aiMatchScore}%
            </div>
            <div className="text-xs text-muted-foreground">AI match</div>
          </div>
        )}
      </div>

      {/* Latest status note */}
      {app.statusHistory?.[app.statusHistory.length - 1]?.note && (
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {app.statusHistory[app.statusHistory.length - 1].note}
        </div>
      )}
    </div>
  );
}
