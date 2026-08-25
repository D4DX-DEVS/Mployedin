"use client";

import { useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Briefcase,
  Building2,
  Check,
  CalendarClock,
  FileText,
  GraduationCap,
  Languages as LanguagesIcon,
  MapPin,
  MessageSquare,
  Sparkles,
  Star,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCandidateDetail, type Candidate, type CandidateJob } from "@/hooks/useCandidates";
import { ScoreRing, matchBandLabel } from "./ScoreRing";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { formatCount } from "@/lib/ui/intlFormat";

// ── Detail response shape (subset of /api/employers/candidates/[id]) ──
interface DetailLanguage {
  language: string;
  proficiency?: string;
}
interface DetailEducation {
  degree: string;
  institution: string;
  field?: string;
  graduationDate?: string;
  grade?: string;
}
interface DetailExperience {
  jobTitle: string;
  company: string;
  isCurrent?: boolean;
  startDate?: string;
  endDate?: string;
  description?: string;
}
interface CandidateDetailResponse {
  candidate?: {
    userId?: { _id?: string; name?: string; email?: string; avatar?: string };
    currentLocation?: string;
    headline?: string;
    summary?: string;
    skills?: string[];
    experience?: DetailExperience[];
    education?: DetailEducation[];
    languages?: DetailLanguage[];
    certifications?: string[];
    preferredSalary?: { min?: number; max?: number; currency?: string };
    noticePeriod?: number;
    availabilityStatus?: string;
    profileCompleteness?: number;
    totalExperienceYears?: number;
    createdAt?: string;
    workStatus?: string;
    cv?: { originalUrl?: string };
  };
  applications?: Array<{
    _id: string;
    job?: { title?: string };
    status?: string;
    aiMatchScore?: number;
    appliedAt?: string;
  }>;
  interviews?: Array<{ _id: string; jobTitle?: string; type?: string; scheduledAt?: string; status?: string }>;
  notes?: Array<{ _id?: string; text?: string; content?: string; createdAt?: string; jobTitle?: string }>;
  timeline?: Array<{ status?: string; changedAt?: string; jobTitle?: string }>;
}

type DetailTab = "profile" | "experience" | "education" | "activity";

interface CandidateDetailPanelProps {
  candidate: Candidate | null;
  selectedJobData?: CandidateJob | null;
  isInReviewList: boolean;
  onClose?: () => void;
  onOpenCv: (candidate: Candidate) => void;
  onStartMessage: (recipientId: string) => void;
  onOpenProfile: (candidateId: string) => void;
  onToggleReviewList: (candidateId: string) => void;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function formatYear(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : String(d.getFullYear());
}

export function CandidateDetailPanel({
  candidate,
  selectedJobData,
  isInReviewList,
  onClose,
  onOpenCv,
  onStartMessage,
  onOpenProfile,
  onToggleReviewList,
}: CandidateDetailPanelProps) {
  const t = useTranslations("employerCandidates");
  const tMatch = useTranslations("employerCompliance.match");
  const [tab, setTab] = useState<DetailTab>("profile");
  const { data, isLoading } = useCandidateDetail(candidate?._id ?? "");
  const detail = (data as CandidateDetailResponse | undefined)?.candidate;
  const applications = (data as CandidateDetailResponse | undefined)?.applications ?? [];
  const interviews = (data as CandidateDetailResponse | undefined)?.interviews ?? [];
  const notes = (data as CandidateDetailResponse | undefined)?.notes ?? [];

  // ── Empty state (nothing selected) ──
  if (!candidate) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <UserRound className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-semibold text-foreground">{t("detailEmptyTitle")}</p>
        <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">{t("detailEmptyHint")}</p>
      </div>
    );
  }

  const name = detail?.userId?.name ?? candidate.fullName ?? candidate.userId?.name ?? t("unknownCandidate");
  const avatar = detail?.userId?.avatar;
  const recipientId = detail?.userId?._id ?? candidate.userId?._id ?? "";
  const location = detail?.currentLocation ?? candidate.currentLocation;
  const expYears = detail?.totalExperienceYears ?? candidate.totalExperienceYears;
  const availability = detail?.availabilityStatus ?? candidate.availabilityStatus;
  const skills = detail?.skills ?? candidate.skills ?? [];
  const experiences = detail?.experience ?? [];
  const currentRole =
    detail?.headline ??
    experiences.find((e) => e.isCurrent)?.jobTitle ??
    experiences[0]?.jobTitle ??
    candidate.experience?.[0]?.jobTitle ??
    t("roleNotSpecified");
  const currentCompany = experiences.find((e) => e.isCurrent)?.company ?? experiences[0]?.company;

  const score = candidate.matchScore;
  const breakdown = candidate.matchBreakdown;
  const strengths = candidate.strengths ?? [];
  const gaps = candidate.gaps ?? [];

  const availabilityLabel = (() => {
    switch (availability) {
      case "immediately":
        return t("availableNow");
      case "within_month":
        return t("withinMonth");
      case "within_3_months":
        return t("within3Months");
      case "not_available":
        return t("notAvailable");
      default:
        return t("availabilityUnknown");
    }
  })();

  const requiredSkills = new Set((selectedJobData?.requirements?.skills ?? []).map((s) => s.toLowerCase().trim()));
  const hasJob = requiredSkills.size > 0;

  const radarData = breakdown
    ? [
        { axis: t("skillsAxis"), value: breakdown.skills },
        { axis: t("experienceAxis"), value: breakdown.experience },
        { axis: t("locationAxis"), value: breakdown.location },
        { axis: t("languageAxis"), value: breakdown.language },
      ]
    : [];

  const salary = detail?.preferredSalary;
  const salaryText =
    salary && (salary.min || salary.max)
      ? `${salary.currency ?? ""} ${salary.min ? formatCount(salary.min) : ""}${salary.min && salary.max ? " – " : ""}${salary.max ? formatCount(salary.max) : ""}`.trim()
      : t("notProvided");
  const noticeText =
    detail?.noticePeriod == null
      ? t("notProvided")
      : detail.noticePeriod === 0
        ? t("immediateStart")
        : t("noticeDaysValue", { days: detail.noticePeriod });
  const languageText =
    detail?.languages && detail.languages.length > 0
      ? detail.languages.map((l) => l.language).join(", ")
      : t("notProvided");
  const memberSince = formatYear(detail?.createdAt) ?? t("notProvided");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Header */}
      <div className="relative border-b border-border bg-gradient-to-br from-primary/5 via-card to-card p-5">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 ring-2 ring-background">
            {avatar ? <AvatarImage src={avatar} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-foreground">{name}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{currentRole}</span>
              {currentCompany ? (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="truncate">{currentCompany}</span>
                </>
              ) : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {location}
                </span>
              ) : null}
              {expYears != null ? (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {t("yearsExperience", { years: expYears })}
                </span>
              ) : null}
            </div>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
              <CalendarClock className="h-3 w-3" />
              {availabilityLabel}
            </span>
          </div>
          <ScoreRing
            value={score}
            size={68}
            strokeWidth={6}
            label={t("matchLabel")}
            emptyLabel="—"
            bandLabel={matchBandLabel(score, tMatch)}
          />
        </div>

        <CandidateDataNotice variant="candidateDetail" className="mt-4" />

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1.5" disabled={!recipientId} onClick={() => recipientId && onStartMessage(recipientId)}>
            <MessageSquare className="h-3.5 w-3.5" />
            {t("messageAction")}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpenCv(candidate)}>
            <FileText className="h-3.5 w-3.5" />
            {t("viewCv")}
          </Button>
          <Button
            size="sm"
            variant={isInReviewList ? "secondary" : "outline"}
            className="gap-1.5"
            onClick={() => onToggleReviewList(candidate._id)}
          >
            <Star className={cn("h-3.5 w-3.5", isInReviewList && "fill-current")} />
            {isInReviewList ? t("savedForReview") : t("saveForReview")}
          </Button>
          <Button size="sm" variant="ghost" className="ms-auto gap-1.5" onClick={() => onOpenProfile(candidate._id)}>
            <UserRound className="h-3.5 w-3.5" />
            {t("openProfile")}
          </Button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-3 sm:space-y-4 overflow-y-auto p-5">
        {/* Quick facts */}
        <section className="rounded-xl border border-border bg-muted/20 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("quickFacts")}</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <QuickFact icon={<Wallet className="h-3.5 w-3.5" />} label={t("expectedSalary")} value={salaryText} loading={isLoading} />
            <QuickFact icon={<CalendarClock className="h-3.5 w-3.5" />} label={t("noticePeriod")} value={noticeText} loading={isLoading} />
            <QuickFact icon={<LanguagesIcon className="h-3.5 w-3.5" />} label={t("languagesLabel")} value={languageText} loading={isLoading} />
            <QuickFact
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label={t("profileQuality")}
              value={detail?.profileCompleteness != null ? t("percentComplete", { percent: detail.profileCompleteness }) : t("notProvided")}
              loading={isLoading}
            />
            <QuickFact icon={<Building2 className="h-3.5 w-3.5" />} label={t("memberSince")} value={memberSince} loading={isLoading} />
            <QuickFact
              icon={<Briefcase className="h-3.5 w-3.5" />}
              label={t("workStatusLabel")}
              value={detail?.workStatus ? t(detail.workStatus === "fresher" ? "fresher" : "experienced") : t("notProvided")}
              loading={isLoading}
            />
          </dl>
        </section>

        {/* AI match analysis */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t("aiMatchAnalysis")}
          </h3>
          {score == null ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">{t("runMatchHint")}</p>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {candidate.matchSummary ? (
                <p className="text-sm leading-relaxed text-foreground/90">{candidate.matchSummary}</p>
              ) : null}
              {breakdown ? (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid stroke="currentColor" className="text-border" />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "currentColor" }} className="text-muted-foreground" />
                      <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
              {strengths.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-emerald-600">{t("strengths")}</p>
                  <ul className="space-y-1">
                    {strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-foreground/90">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {gaps.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-rose-600">{t("gaps")}</p>
                  <ul className="space-y-1">
                    {gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-foreground/90">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* Top skills */}
        {skills.length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("keySkills")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => {
                const matched = hasJob && requiredSkills.has(skill.toLowerCase().trim());
                return (
                  <span
                    key={skill}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                      matched
                        ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30"
                        : "bg-muted text-foreground/80",
                    )}
                  >
                    {matched ? <Check className="h-3 w-3" /> : null}
                    {skill}
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Tabs */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2">
            <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
              {t("tabProfile")}
            </TabButton>
            <TabButton active={tab === "experience"} onClick={() => setTab("experience")}>
              {t("tabExperience")}
            </TabButton>
            <TabButton active={tab === "education"} onClick={() => setTab("education")}>
              {t("tabEducation")}
            </TabButton>
            <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
              {t("tabActivity")}
            </TabButton>
          </div>
          <div className="p-4">
            {tab === "profile" ? (
              <div className="space-y-3 sm:space-y-4">
                {detail?.summary || detail?.headline ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("professionalSummary")}</p>
                    <p className="text-sm leading-relaxed text-foreground/90">{detail.summary ?? detail.headline}</p>
                  </div>
                ) : null}
                {detail?.languages && detail.languages.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("languagesLabel")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.languages.map((l) => (
                        <span key={l.language} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground/80">
                          {l.language}
                          {l.proficiency ? <span className="text-muted-foreground"> · {l.proficiency}</span> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail?.certifications && detail.certifications.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("certifications")}</p>
                    <ul className="space-y-1">
                      {detail.certifications.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-sm text-foreground/90">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!detail?.summary && !detail?.headline && (!detail?.languages || detail.languages.length === 0) && (!detail?.certifications || detail.certifications.length === 0) ? (
                  <EmptyTab loading={isLoading} text={t("noProfileData")} />
                ) : null}
              </div>
            ) : null}

            {tab === "experience" ? (
              experiences.length > 0 ? (
                <ol className="space-y-3 sm:space-y-4">
                  {experiences.map((exp, i) => {
                    const start = formatYear(exp.startDate);
                    const end = exp.isCurrent ? t("present") : formatYear(exp.endDate);
                    return (
                      <li key={i} className="relative ps-5">
                        <span className="absolute start-0 top-1.5 h-2 w-2 rounded-full bg-primary" />
                        {i < experiences.length - 1 ? <span className="absolute start-[3px] top-4 h-full w-px bg-border" /> : null}
                        <p className="text-sm font-semibold text-foreground">{exp.jobTitle}</p>
                        <p className="text-xs text-muted-foreground">
                          {exp.company}
                          {start ? <span> · {start}{end ? ` – ${end}` : ""}</span> : null}
                        </p>
                        {exp.description ? <p className="mt-1 text-xs leading-relaxed text-foreground/80">{exp.description}</p> : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyTab loading={isLoading} text={t("noExperienceData")} />
              )
            ) : null}

            {tab === "education" ? (
              detail?.education && detail.education.length > 0 ? (
                <ul className="space-y-3">
                  {detail.education.map((edu, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{edu.degree}</p>
                        <p className="text-xs text-muted-foreground">
                          {edu.institution}
                          {edu.field ? ` · ${edu.field}` : ""}
                          {formatYear(edu.graduationDate) ? ` · ${formatYear(edu.graduationDate)}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyTab loading={isLoading} text={t("noEducationData")} />
              )
            ) : null}

            {tab === "activity" ? (
              applications.length > 0 || interviews.length > 0 || notes.length > 0 ? (
                <div className="space-y-3 sm:space-y-4">
                  {applications.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("applicationsLabel")}</p>
                      <ul className="space-y-1.5">
                        {applications.map((app) => (
                          <li key={app._id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-foreground/90">{app.job?.title ?? t("roleNotSpecified")}</span>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{app.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {interviews.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("interviewsLabel")}</p>
                      <ul className="space-y-1.5">
                        {interviews.map((iv) => (
                          <li key={iv._id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-foreground/90">{iv.jobTitle ?? t("roleNotSpecified")}</span>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{iv.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {notes.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("notesLabel")}</p>
                      <ul className="space-y-1.5">
                        {notes.slice(0, 5).map((note, i) => (
                          <li key={note._id ?? i} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-foreground/80">
                            {note.text ?? note.content}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyTab loading={isLoading} text={t("noActivityData")} />
              )
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickFact({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading?: boolean }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
        {loading ? <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" /> : value}
      </dd>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyTab({ text, loading }: { text: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <span className="block h-4 w-3/4 animate-pulse rounded bg-muted" />
        <span className="block h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  return <p className="py-4 text-center text-xs text-muted-foreground">{text}</p>;
}
