"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Briefcase, MapPin, Calendar, Clock, CheckCircle,
  XCircle, FileText, Star, MessageSquare, User, ChevronDown, ChevronUp,
} from "lucide-react";
import { useCandidateDetail } from "@/hooks/useCandidates";

/* ── Types ── */
interface CandidateJob {
  _id: string;
  title: string;
  status?: string;
  location?: { country?: string };
}

interface UnifiedApplication {
  _id: string;
  job: CandidateJob;
  status: string;
  aiMatchScore?: number;
  matchBreakdown?: Record<string, number>;
  behaviorScore?: number;
  appliedAt: string;
  rejectionReason?: string;
  source?: string;
}

interface UnifiedInterview {
  _id: string;
  applicationId: string;
  jobTitle: string;
  type: string;
  scheduledAt: string;
  duration: number;
  status: string;
  outcome?: string;
  candidateResponse: string;
}

interface TimelineEntry {
  applicationId: string;
  jobTitle: string;
  status: string;
  changedAt: string;
  note?: string;
}

interface NoteEntry {
  _id: string;
  authorName: string;
  content: string;
  createdAt: string;
  jobTitle: string;
}

interface CandidateProfile {
  candidate: {
    _id: string;
    userId?: { name: string; email: string };
    currentLocation?: string;
    skills?: string[];
    experience?: { jobTitle: string; company: string; isCurrent: boolean; startDate?: string; endDate?: string }[];
    education?: { degree?: string; institution?: string; field?: string }[];
    languages?: { language: string; proficiency: string }[];
    availabilityStatus?: string;
    profileCompleteness?: number;
    badges?: string[];
  };
  company: string;
  applications: UnifiedApplication[];
  interviews: UnifiedInterview[];
  notes: NoteEntry[];
  timeline: TimelineEntry[];
  summary: {
    totalApplications: number;
    activeApplications: number;
    totalInterviews: number;
    hired: boolean;
  };
}

/* ── Helpers ── */
const statusColor: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800",
  shortlisted: "bg-indigo-100 text-indigo-800",
  interview_scheduled: "bg-purple-100 text-purple-800",
  selected: "bg-emerald-100 text-emerald-800",
  offer: "bg-amber-100 text-amber-800",
  hired: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-slate-100 text-slate-800",
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const scoreColor = (s: number) =>
  s >= 80 ? "text-emerald-600" : s >= 60 ? "text-amber-600" : "text-red-500";

const availabilityLabel: Record<string, string> = {
  immediately: "Available Immediately",
  within_month: "Within 1 Month",
  within_3_months: "Within 3 Months",
  not_available: "Not Available",
};

/* ── Page ── */
export default function UnifiedCandidatePage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const router = useRouter();
  const { data, isLoading: loading } = useCandidateDetail(id);
  const [activeTab, setActiveTab] = useState<"applications" | "interviews" | "timeline" | "notes">("applications");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="page-container space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
        <div className="h-60 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container flex flex-col items-center justify-center py-20">
        <User className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="font-semibold text-lg">Candidate not found</h3>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  const { candidate, applications, interviews, timeline, notes, summary } = data;
  const name = candidate.userId?.name ?? "Unknown Candidate";
  const currentRole = candidate.experience?.find((e: { isCurrent?: boolean }) => e.isCurrent);

  const tabs = [
    { key: "applications" as const, label: "Applications", count: applications.length },
    { key: "interviews" as const, label: "Interviews", count: interviews.length },
    { key: "timeline" as const, label: "Activity", count: timeline.length },
    { key: "notes" as const, label: "Notes", count: notes.length },
  ];

  return (
    <div className="page-container space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/employer/candidates`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={name} description="Unified Candidate Profile" />
      </div>

      {/* Profile Card */}
      <div className="card-base p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Left — Info */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{name}</h2>
              {summary.hired && <Badge className="bg-green-100 text-green-800">Hired ✅</Badge>}
              {candidate.availabilityStatus && (
                <Badge variant="secondary">{availabilityLabel[candidate.availabilityStatus] ?? candidate.availabilityStatus}</Badge>
              )}
            </div>

            {candidate.userId?.email && (
              <p className="text-sm text-muted-foreground">{candidate.userId.email}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {currentRole && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> {currentRole.jobTitle} at {currentRole.company}
                </span>
              )}
              {candidate.currentLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {candidate.currentLocation}
                </span>
              )}
              {candidate.profileCompleteness != null && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> {candidate.profileCompleteness}% profile
                </span>
              )}
            </div>

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {candidate.skills.slice(0, 10).map((s: string) => (
                  <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                ))}
                {candidate.skills.length > 10 && (
                  <Badge variant="outline" className="text-xs">+{candidate.skills.length - 10}</Badge>
                )}
              </div>
            )}
          </div>

          {/* Right — Summary Stats */}
          <div className="grid grid-cols-2 gap-3 min-w-0 md:min-w-[200px]">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700">{summary.totalApplications}</p>
              <p className="text-xs text-blue-600">Applications</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-700">{summary.totalInterviews}</p>
              <p className="text-xs text-purple-600">Interviews</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-lg">
              <p className="text-2xl font-bold text-emerald-700">{summary.activeApplications}</p>
              <p className="text-xs text-emerald-600">Active</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <p className="text-2xl font-bold text-amber-700">
                {applications.filter((a: UnifiedApplication) => a.aiMatchScore != null).length > 0
                  ? Math.round(applications.reduce((s: number, a: UnifiedApplication) => s + (a.aiMatchScore ?? 0), 0) / applications.filter((a: UnifiedApplication) => a.aiMatchScore != null).length)
                  : "—"}
              </p>
              <p className="text-xs text-amber-600">Avg Match</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="ml-1 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "applications" && (
        <div className="space-y-3">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No applications found</p>
          ) : (
            applications.map((app: UnifiedApplication) => (
              <div key={app._id} className="card-base overflow-hidden">
                <button
                  onClick={() => setExpandedApp(expandedApp === app._id ? null : app._id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{app.job?.title ?? "Unknown Job"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-3 w-3" /> Applied {formatDate(app.appliedAt)}
                        {app.source && <span>· via {app.source.replace("_", " ")}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {app.aiMatchScore != null && (
                      <span className={`text-lg font-bold ${scoreColor(app.aiMatchScore)}`}>{app.aiMatchScore}%</span>
                    )}
                    <Badge className={`text-xs ${statusColor[app.status] ?? "bg-slate-100 text-slate-800"}`}>
                      {app.status.replace("_", " ")}
                    </Badge>
                    {expandedApp === app._id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {expandedApp === app._id && (
                  <div className="px-4 pb-4 pt-0 border-t space-y-3">
                    {/* Match Breakdown */}
                    {app.matchBreakdown && (
                      <div className="space-y-1.5 pt-2">
                        <p className="text-xs font-medium text-muted-foreground">Match Breakdown</p>
                        {Object.entries(app.matchBreakdown).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="capitalize text-muted-foreground w-16 sm:w-20">{k}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                                style={{ width: `${v}%` }}
                              />
                            </div>
                            <span className="font-medium w-8 text-right">{v}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {app.rejectionReason && (
                      <p className="text-xs text-red-600">
                        <XCircle className="h-3 w-3 inline mr-1" />
                        {app.rejectionReason}
                      </p>
                    )}
                    {/* Interviews for this application */}
                    {interviews.filter((iv: UnifiedInterview) => iv.applicationId === app._id).length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Interviews</p>
                        {interviews
                          .filter((iv: UnifiedInterview) => iv.applicationId === app._id)
                          .map((iv: UnifiedInterview) => (
                            <div key={iv._id} className="flex items-center gap-3 text-xs py-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>{formatDateTime(iv.scheduledAt)}</span>
                              <Badge variant="outline" className="text-[10px]">{iv.type}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{iv.status}</Badge>
                              {iv.outcome && (
                                <Badge className={`text-[10px] ${iv.outcome === "passed" ? "bg-emerald-100 text-emerald-700" : iv.outcome === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                  {iv.outcome}
                                </Badge>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "interviews" && (
        <div className="space-y-3">
          {interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No interviews scheduled</p>
          ) : (
            interviews.map((iv: UnifiedInterview) => (
              <div key={iv._id} className="card-base p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{iv.jobTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {formatDateTime(iv.scheduledAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {iv.duration} min
                    </span>
                    <Badge variant="outline" className="text-[10px]">{iv.type}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${iv.status === "completed" ? "bg-emerald-100 text-emerald-700" : iv.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                    {iv.status}
                  </Badge>
                  {iv.outcome && (
                    <Badge className={`text-xs ${iv.outcome === "passed" ? "bg-emerald-100 text-emerald-700" : iv.outcome === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {iv.outcome}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="card-base p-4">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
          ) : (
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
              {timeline.map((entry: TimelineEntry, i: number) => (
                <div key={i} className="relative">
                  <div className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2 border-white ${statusColor[entry.status]?.split(" ")[0] ?? "bg-slate-300"}`} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] ${statusColor[entry.status] ?? "bg-slate-100 text-slate-800"}`}>
                        {entry.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{entry.jobTitle}</span>
                      <span className="text-xs text-muted-foreground">· {formatDateTime(entry.changedAt)}</span>
                    </div>
                    {entry.note && <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "notes" && (
        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notes yet</p>
          ) : (
            notes.map((note: NoteEntry) => (
              <div key={note._id} className="card-base p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{note.authorName}</span>
                    <span className="text-muted-foreground">on {note.jobTitle}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                </div>
                <p className="text-sm">{note.content}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
