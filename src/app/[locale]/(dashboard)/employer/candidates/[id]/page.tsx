"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Briefcase, MapPin, Calendar, Clock, CheckCircle,
  XCircle, FileText, Star, MessageSquare, User, ChevronDown, ChevronUp,
  GraduationCap, Languages, Award, Eye, Download, AlertCircle,
} from "lucide-react";
import { useCandidateDetail } from "@/hooks/useCandidates";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { CvInlineFrame } from "@/components/shared/CvInlineFrame";
import { useTranslations } from "next-intl";

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
    experience?: { jobTitle: string; company: string; isCurrent: boolean; startDate?: string; endDate?: string; description?: string; country?: string }[];
    education?: { degree?: string; institution?: string; field?: string; graduationDate?: string; grade?: string }[];
    languages?: { language: string; proficiency: string }[];
    certifications?: string[];
    availabilityStatus?: string;
    profileCompleteness?: number;
    badges?: string[];
    cv?: { originalUrl?: string };
    headline?: string;
    totalExperienceYears?: number;
    preferredSalary?: { min: number; max: number; currency: string };
    preferredJobType?: string;
    preferredLocations?: string[];
    preferredRoles?: string[];
    noticePeriod?: number;
    workStatus?: string;
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
  const t = useTranslations("employerCandidateProfile");
  const { data, isLoading: loading } = useCandidateDetail(id);
  const [activeTab, setActiveTab] = useState<"profile" | "applications" | "interviews" | "timeline" | "notes">("profile");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [viewingCv, setViewingCv] = useState(false);

  if (loading) {
    return (
      <div className="page-container">
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
        <h3 className="font-semibold text-lg">{t("notFound")}</h3>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("goBack")}
        </Button>
      </div>
    );
  }

  const { candidate, applications, interviews, timeline, notes, summary } = data;
  const name = candidate.userId?.name ?? "Unknown Candidate";
  const currentRole = candidate.experience?.find((e: { isCurrent?: boolean }) => e.isCurrent);

  // CVs are private; serve them only through the authorized application download
  // route, which enforces the tiered access policy. The candidate page is only
  // reachable for candidates who applied to this employer, so use their most
  // recent application as the access context.
  const cvAppId = applications[0]?._id;
  // Inline preview streams the CV through our OWN origin (Content-Disposition:
  // inline, same-origin → CORS-safe) so the blob viewer can frame the PDF.
  // Pointing an <iframe> straight at the application download route instead
  // 302-redirects to the cross-origin Spaces URL, which Chrome refuses to frame
  // ("This page has been blocked by Chrome"). withAuth enforces tiered access.
  const cvViewHref = candidate.cv?.originalUrl
    ? `/api/employers/candidates/${id}/cv#cv.pdf`
    : undefined;
  // Download keeps the application route (forces a save with the real filename);
  // falls back to the inline stream for pool candidates with no application.
  const cvDownloadHref =
    candidate.cv?.originalUrl && cvAppId
      ? `/api/applications/${cvAppId}/documents/download?cv=1#cv.pdf`
      : cvViewHref;

  const tabs = [
    { key: "profile" as const, label: t("tabProfile"), count: null },
    { key: "applications" as const, label: t("tabApplications"), count: applications.length },
    { key: "interviews" as const, label: t("tabInterviews"), count: interviews.length },
    { key: "timeline" as const, label: t("tabActivity"), count: timeline.length },
    { key: "notes" as const, label: t("tabNotes"), count: notes.length },
  ];

  return (
    <div className="page-container">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/employer/candidates`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={name} description={t("unifiedProfile")} />
      </div>

      {/* Profile Card */}
      <div className="card-base panel-body">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Left — Info */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{name}</h2>
              {summary.hired && <Badge className="bg-green-100 text-green-800">{t("hired")}</Badge>}
              {candidate.availabilityStatus && (
                <Badge variant="secondary">{{immediately: t("availableImmediately"), within_month: t("within1Month"), within_3_months: t("within3Months"), not_available: t("notAvailable")}[candidate.availabilityStatus as string] ?? candidate.availabilityStatus}</Badge>
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
                  <FileText className="h-3.5 w-3.5" /> {t("profilePercent", { percent: candidate.profileCompleteness })}
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

            {/* Resume actions */}
            {cvViewHref && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setViewingCv(true)}>
                  <Eye className="w-3 h-3 me-1.5" /> {t("viewCV")}
                </Button>
                <a href={cvDownloadHref} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost" className="h-8 text-xs">
                    <Download className="w-3 h-3 me-1.5" /> {t("download")}
                  </Button>
                </a>
              </div>
            )}
          </div>

          {/* Right — Summary Stats */}
          <div className="grid grid-cols-2 gap-3 min-w-0 md:min-w-[200px]">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700">{summary.totalApplications}</p>
              <p className="text-xs text-blue-600">{t("applications")}</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-700">{summary.totalInterviews}</p>
              <p className="text-xs text-purple-600">{t("interviews")}</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-lg">
              <p className="text-2xl font-bold text-emerald-700">{summary.activeApplications}</p>
              <p className="text-xs text-emerald-600">{t("active")}</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <p className="text-2xl font-bold text-amber-700">
                {applications.filter((a: UnifiedApplication) => a.aiMatchScore != null).length > 0
                  ? Math.round(applications.reduce((s: number, a: UnifiedApplication) => s + (a.aiMatchScore ?? 0), 0) / applications.filter((a: UnifiedApplication) => a.aiMatchScore != null).length)
                  : "—"}
              </p>
              <p className="text-xs text-amber-600">{t("avgMatch")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label} {tab.count != null && <span className="ml-1 text-xs opacity-60">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column — Structured Profile */}
          <div className="space-y-3 sm:space-y-6">
            {/* Summary */}
            <div className="card-base space-y-3 panel-body">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> {t("summary")}
              </h3>
              {candidate.headline && (
                <p className="text-sm text-muted-foreground">{candidate.headline}</p>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {candidate.workStatus && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("workStatus")}</span>
                    <p className="font-medium capitalize">{candidate.workStatus}</p>
                  </div>
                )}
                {candidate.totalExperienceYears != null && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("totalExperience")}</span>
                    <p className="font-medium">{candidate.totalExperienceYears} years</p>
                  </div>
                )}
                {candidate.noticePeriod != null && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("noticePeriod")}</span>
                    <p className="font-medium">{candidate.noticePeriod} days</p>
                  </div>
                )}
                {candidate.preferredJobType && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("preferredType")}</span>
                    <p className="font-medium capitalize">{candidate.preferredJobType}</p>
                  </div>
                )}
                {candidate.preferredSalary && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">{t("expectedSalary")}</span>
                    <p className="font-medium">
                      {candidate.preferredSalary.currency} {candidate.preferredSalary.min?.toLocaleString()} – {candidate.preferredSalary.max?.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
              {candidate.preferredRoles && candidate.preferredRoles.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t("preferredRoles")}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {candidate.preferredRoles.map((r: string) => (
                      <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {candidate.preferredLocations && candidate.preferredLocations.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t("preferredLocations")}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {candidate.preferredLocations.map((l: string) => (
                      <Badge key={l} variant="outline" className="text-xs">{l}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Work History */}
            {candidate.experience && candidate.experience.length > 0 && (
              <div className="card-base space-y-3 panel-body">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> {t("workHistory")}
                </h3>
                <div className="space-y-3 sm:space-y-4">
                  {candidate.experience.map((exp: { jobTitle: string; company: string; isCurrent: boolean; startDate?: string; endDate?: string; description?: string; country?: string }, i: number) => (
                    <div key={i} className="relative pl-4 border-l-2 border-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{exp.jobTitle}</p>
                        {exp.isCurrent && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Current</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {exp.startDate ? formatDate(exp.startDate) : "?"} – {exp.isCurrent ? "Present" : (exp.endDate ? formatDate(exp.endDate) : "?")}
                      </p>
                      {exp.description && (
                        <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.education && candidate.education.length > 0 && (
              <div className="card-base space-y-3 panel-body">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" /> {t("education")}
                </h3>
                <div className="space-y-3">
                  {candidate.education.map((edu: { degree?: string; institution?: string; field?: string; graduationDate?: string; grade?: string }, i: number) => (
                    <div key={i} className="pl-4 border-l-2 border-border">
                      <p className="font-medium text-sm">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{edu.institution}</p>
                      <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                        {edu.graduationDate && <span>{formatDate(edu.graduationDate)}</span>}
                        {edu.grade && <span>Grade: {edu.grade}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {candidate.languages && candidate.languages.length > 0 && (
              <div className="card-base space-y-3 panel-body">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Languages className="h-4 w-4 text-primary" /> {t("languages")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.languages.map((lang: { language: string; proficiency: string }, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">{lang.language}</span>
                      <Badge variant="secondary" className="text-[10px] capitalize">{lang.proficiency}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {candidate.certifications && candidate.certifications.length > 0 && (
              <div className="card-base space-y-3 panel-body">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" /> {t("certifications")}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.certifications.map((cert: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{cert}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Full Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className="card-base space-y-3 panel-body">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" /> {t("allSkills")}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — AI Insights + Resume */}
          <div className="space-y-3 sm:space-y-6">
            {/* AI Match Insights (from first application with score) */}
            {(() => {
              const scoredApp = applications.find((a: UnifiedApplication) => a.aiMatchScore != null && a.matchBreakdown);
              if (!scoredApp) return null;
              const breakdown = scoredApp.matchBreakdown!;
              const jobSkills = (scoredApp.job as CandidateJob & { requirements?: { skills?: string[] } })?.requirements?.skills;
              const candidateSkills = candidate.skills ?? [];
              const missingSkills = jobSkills?.filter((s: string) => !candidateSkills.some((cs: string) => cs.toLowerCase() === s.toLowerCase())) ?? [];
              return (
                <div className="card-base space-y-3 sm:space-y-4 panel-body">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" /> {t("aiMatchInsights")}
                    <span className="text-xs text-muted-foreground ms-auto">for {scoredApp.job?.title}</span>
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className={`text-3xl font-bold ${scoreColor(scoredApp.aiMatchScore!)}`}>
                      {scoredApp.aiMatchScore}%
                    </div>
                    <span className="text-sm text-muted-foreground">{t("overallMatch")}</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(breakdown).map(([k, v]) => {
                      const val = Number(v) || 0;
                      return (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="capitalize text-muted-foreground w-20">{k}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${val >= 80 ? "bg-emerald-500" : val >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">{val}%</span>
                      </div>
                      );
                    })}
                  </div>
                  {/* Strengths */}
                  {candidateSkills.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-emerald-700 mb-1">{t("strengths")}</p>
                      <div className="flex flex-wrap gap-1">
                        {candidateSkills.slice(0, 8).map((s: string) => (
                          <Badge key={s} className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{s}</Badge>
                        ))}
                        {candidateSkills.length > 8 && (
                          <span className="text-[10px] text-muted-foreground">+{candidateSkills.length - 8} more</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Gaps */}
                  {missingSkills.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {t("skillGaps")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {missingSkills.map((s: string) => (
                          <Badge key={s} variant="outline" className="text-[10px] border-amber-300 text-amber-700">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Inline Resume Viewer (desktop) */}
            {cvViewHref && (
              <div className="card-base overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> {t("resumeCV")}
                  </h3>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewingCv(true)}>
                      <Eye className="w-3 h-3 me-1" /> {t("expand")}
                    </Button>
                    <a href={cvDownloadHref} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        <Download className="w-3 h-3 me-1" /> {t("download")}
                      </Button>
                    </a>
                  </div>
                </div>
                <div className="h-[500px]">
                  <CvInlineFrame url={cvViewHref} title={`${name}'s Resume`} downloadHref={cvDownloadHref} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "applications" && (
        <div className="space-y-3">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("noApplications")}</p>
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
                        <Calendar className="h-3 w-3" /> {t("appliedOn", { date: formatDate(app.appliedAt) })}
                        {app.source && <span>· {t("viaSource", { source: app.source.replace("_", " ") })}</span>}
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
                        <p className="text-xs font-medium text-muted-foreground">{t("matchBreakdown")}</p>
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
            <p className="text-sm text-muted-foreground text-center py-8">{t("noInterviews")}</p>
          ) : (
            interviews.map((iv: UnifiedInterview) => (
              <div key={iv._id} className="card-base flex items-center justify-between panel-body">
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
        <div className="card-base panel-body">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("noActivity")}</p>
          ) : (
            <div className="relative pl-6 space-y-3 sm:space-y-4">
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
            <p className="text-sm text-muted-foreground text-center py-8">{t("noNotes")}</p>
          ) : (
            notes.map((note: NoteEntry) => (
              <div key={note._id} className="card-base panel-body">
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

      {/* Resume Viewer Modal */}
      {viewingCv && cvViewHref && (
        <ResumeViewerModal
          url={cvViewHref}
          candidateName={name}
          onClose={() => setViewingCv(false)}
        />
      )}
    </div>
  );
}
