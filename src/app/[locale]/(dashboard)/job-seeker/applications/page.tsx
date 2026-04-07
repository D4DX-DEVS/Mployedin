"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileText, MapPin, Calendar, Clock, ChevronRight, Star, LogOut, Loader2, X, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  const { locale } = useParams<{ locale: string }>();
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
                  <ApplicationCard key={app._id} app={app} locale={locale} onWithdrawn={fetchApplications} />
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

const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];

const WITHDRAWAL_REASONS = [
  { value: "accepted_elsewhere", label: "Accepted offer elsewhere" },
  { value: "salary_too_low", label: "Salary expectation not met" },
  { value: "bad_experience", label: "Poor application experience" },
  { value: "too_slow_process", label: "Process too slow" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "personal_reasons", label: "Personal reasons" },
  { value: "other", label: "Other" },
];

function ApplicationCard({
  app,
  locale,
  onWithdrawn,
}: {
  app: Application;
  locale: string;
  onWithdrawn: () => void;
}) {
  const job = app.jobId;
  const appliedDate = new Date(app.appliedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  async function handleWithdraw() {
    if (!withdrawReason) return;
    setWithdrawing(true);
    setWithdrawError("");
    try {
      const res = await fetch(`/api/applications/${app._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "withdrawn",
          withdrawalReason: withdrawReason,
          withdrawalNote: withdrawNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to withdraw");
      }
      setShowWithdraw(false);
      onWithdrawn();
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setWithdrawing(false);
    }
  }

  const isActive = !TERMINAL_STATUSES.includes(app.status);

  return (
    <>
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
                  <MapPin className="w-3 h-3" /> {typeof job.location === "object" && job.location ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ")) : job.location}
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

          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* AI match score */}
            {app.aiMatchScore != null && app.aiMatchScore > 0 && (
              <div className="text-center">
                <div className={`text-lg font-bold ${app.aiMatchScore >= 70 ? "text-emerald-600" : app.aiMatchScore >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {app.aiMatchScore}%
                </div>
                <div className="text-xs text-muted-foreground">AI match</div>
              </div>
            )}
            {/* Withdraw button */}
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => setShowWithdraw(true)}
              >
                <LogOut className="w-3 h-3" /> Withdraw
              </Button>
            )}
          </div>
        </div>

        {/* Latest status note */}
        {app.statusHistory?.[app.statusHistory.length - 1]?.note && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3 flex-shrink-0" />
            {app.statusHistory[app.statusHistory.length - 1].note}
          </div>
        )}

        {/* Rate Experience CTA */}
        {TERMINAL_STATUSES.includes(app.status) && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">How was your experience?</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-amber-600 hover:text-amber-700" asChild>
              <Link href={`/${locale}/job-seeker/applications/${app._id}/feedback`}>
                <Star className="w-3 h-3" /> Rate Experience
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      {showWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWithdraw(false); }}
        >
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Withdraw Application</h2>
              <button
                type="button"
                onClick={() => setShowWithdraw(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              You&apos;re about to withdraw your application for <strong>{job?.title}</strong>. This action cannot be undone.
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason <span className="text-destructive">*</span></label>
              <Select value={withdrawReason} onValueChange={setWithdrawReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {WITHDRAWAL_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Additional comments <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                placeholder="Anything else you'd like to share…"
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="resize-none"
              />
            </div>

            {withdrawError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {withdrawError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={handleWithdraw}
                disabled={!withdrawReason || withdrawing}
              >
                {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Withdrawal
              </Button>
              <Button variant="outline" onClick={() => setShowWithdraw(false)} disabled={withdrawing}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
