"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCandidates, usePublishedJobs, useStartConversation, useAiMatch } from "@/hooks/useCandidates";
import { useDebounce } from "@/hooks/useDebounce";
import type { Candidate, CandidateJob } from "@/hooks/useCandidates";
import {
  filterCandidatesByScore,
  getAutoReviewCandidateIds,
  getCandidateWorkflowState,
  getScoreFilterCounts,
  parseCandidateMatchSessionState,
  serializeCandidateMatchSessionState,
  type CandidateScoreFilter,
} from "@/lib/candidateMatching";
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

const MATCH_SESSION_STORAGE_KEY = "employer-candidate-matching-session-v1";
const MAX_AI_MATCH_BATCH_SIZE = 20;
const AI_SEARCH_SUGGESTIONS = [
  "High match React candidates in Dubai ready now",
  "Frontend candidates with TypeScript and Node.js",
  "Saved candidates available within one month",
];

const AVAILABILITY_OPTIONS = [
  { value: "all", label: "Any availability" },
  { value: "immediately", label: "Available now" },
  { value: "within_month", label: "Within 1 month" },
  { value: "within_3_months", label: "Within 3 months" },
  { value: "not_available", label: "Not available" },
] as const;

const SCORE_FILTER_LABELS: Record<CandidateScoreFilter, string> = {
  all: "All scores",
  high: "High match",
  good: "Good fit",
  low: "Low fit",
  unscored: "Unscored",
};

interface AiCandidateSearchResponse {
  summary?: string;
  degraded?: boolean;
  filters?: {
    search?: string;
    jobQuery?: string;
    location?: string;
    skills?: string[];
    availability?: string;
    scoreBand?: CandidateScoreFilter;
  };
}

interface MatchFeedback {
  type: "error" | "info" | "success";
  message: string;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function findMatchingJobId(jobQuery: string | undefined, jobs: CandidateJob[]): string {
  const normalizedQuery = normalizeText(jobQuery);
  if (!normalizedQuery) {
    return "";
  }

  const exactMatch = jobs.find((job) => normalizeText(job.title) === normalizedQuery);
  if (exactMatch) {
    return exactMatch._id;
  }

  const partialMatch = jobs.find((job) => normalizeText(job.title).includes(normalizedQuery) || normalizedQuery.includes(normalizeText(job.title)));
  return partialMatch?._id ?? "";
}

function fallbackParseCandidateMatchSessionState(raw: string | null): { selectedJobId: string; reviewListIds: string[] } {
  if (!raw) {
    return { selectedJobId: "", reviewListIds: [] };
  }

  try {
    const parsed = JSON.parse(raw) as {
      selectedJobId?: unknown;
      reviewListIds?: unknown;
    };

    const reviewListIds = Array.isArray(parsed.reviewListIds)
      ? Array.from(
          new Set(
            parsed.reviewListIds
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean)
          )
        )
      : [];

    return {
      selectedJobId: typeof parsed.selectedJobId === "string" ? parsed.selectedJobId.trim() : "",
      reviewListIds,
    };
  } catch {
    return { selectedJobId: "", reviewListIds: [] };
  }
}

function safeParseCandidateMatchSessionState(raw: string | null) {
  if (typeof parseCandidateMatchSessionState === "function") {
    return parseCandidateMatchSessionState(raw);
  }

  return fallbackParseCandidateMatchSessionState(raw);
}

function safeSerializeCandidateMatchSessionState(state: { selectedJobId: string; reviewListIds: string[] }) {
  if (typeof serializeCandidateMatchSessionState === "function") {
    return serializeCandidateMatchSessionState(state);
  }

  return JSON.stringify({
    selectedJobId: state.selectedJobId.trim(),
    reviewListIds: Array.from(
      new Set(state.reviewListIds.map((value) => value.trim()).filter(Boolean))
    ),
  });
}

const scoreBadgeClass = (score?: number) => {
  if (score == null) return "border border-slate-200 bg-white text-slate-600 shadow-sm";
  if (score >= 80) return "border border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm";
  if (score >= 60) return "border border-amber-300 bg-amber-50 text-amber-800 shadow-sm";
  return "border border-rose-300 bg-rose-50 text-rose-700 shadow-sm";
};

const cardSurfaceClass = (score?: number, savedForReview?: boolean) => {
  if (savedForReview) {
    return "border-sky-200 bg-[linear-gradient(180deg,_rgba(240,249,255,0.96),_rgba(255,255,255,0.98))] shadow-[0_24px_60px_-44px_rgba(14,165,233,0.45)]";
  }

  if (score != null && score >= 80) {
    return "border-emerald-200 bg-[linear-gradient(180deg,_rgba(236,253,245,0.96),_rgba(255,255,255,0.98))] shadow-[0_24px_60px_-44px_rgba(16,185,129,0.35)]";
  }

  return "border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]";
};

const availabilityTone = (status?: string) => {
  switch (status) {
    case "immediately":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "within_month":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "within_3_months":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "not_available":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
};

function getMatchedSkills(candidate: Candidate, selectedJobData?: CandidateJob) {
  const requiredSkills = selectedJobData?.requirements?.skills ?? [];
  const candidateSkills = new Set((candidate.skills ?? []).map((skill) => normalizeText(skill)));

  return requiredSkills.filter((skill) => candidateSkills.has(normalizeText(skill)));
}

function getMissingSkills(candidate: Candidate, selectedJobData?: CandidateJob) {
  const requiredSkills = selectedJobData?.requirements?.skills ?? [];
  const candidateSkills = new Set((candidate.skills ?? []).map((skill) => normalizeText(skill)));

  return requiredSkills.filter((skill) => !candidateSkills.has(normalizeText(skill)));
}

function getCandidateDisplayName(candidate: Candidate): string {
  const profileName = candidate.fullName?.trim();
  if (profileName) {
    return profileName;
  }

  const accountName = candidate.userId?.name?.trim();
  return accountName || "Unknown candidate";
}

interface CandidateCardProps {
  candidate: Candidate;
  selectedJobData?: CandidateJob;
  hasAnyScore: boolean;
  rank: number | null;
  isInReviewList: boolean;
  onOpenCv: (candidate: Candidate) => void;
  onOpenProfile: (candidateId: string) => void;
  onStartMessage: (recipientId: string) => void;
  onToggleReviewList: (candidateId: string) => void;
  onOpenInsights: () => void;
}

function CandidateMatchCard({
  candidate,
  selectedJobData,
  hasAnyScore,
  rank,
  isInReviewList,
  onOpenCv,
  onOpenProfile,
  onStartMessage,
  onToggleReviewList,
  onOpenInsights,
}: CandidateCardProps) {
  const currentRole = candidate.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? null;
  const matchedSkills = getMatchedSkills(candidate, selectedJobData);
  const missingSkills = getMissingSkills(candidate, selectedJobData);
  const requiredSkills = selectedJobData?.requirements?.skills ?? [];
  const topSkills = (candidate.skills ?? []).slice(0, 3);
  const extraSkillCount = Math.max(0, (candidate.skills?.length ?? 0) - topSkills.length);
  const messageRecipientId = candidate.userId?._id;
  const hasSecondaryActions = Boolean(candidate.cv?.originalUrl || candidate.userId?._id || candidate._id);
  const availabilityLabel = candidate.availabilityStatus === "immediately"
    ? "Available now"
    : candidate.availabilityStatus === "within_month"
      ? "Within 1 month"
      : candidate.availabilityStatus === "within_3_months"
        ? "Within 3 months"
        : candidate.availabilityStatus === "not_available"
          ? "Not available"
          : "Availability unknown";

  const primaryMeta = [candidate.currentLocation, candidate.totalExperienceYears != null ? `${candidate.totalExperienceYears}+ yrs` : null]
    .filter(Boolean)
    .join(" • ");

  const visibleSkills = selectedJobData && matchedSkills.length > 0 ? matchedSkills.slice(0, 3) : topSkills;
  const overflowSkillCount = selectedJobData && matchedSkills.length > 0
    ? Math.max(0, matchedSkills.length - visibleSkills.length)
    : extraSkillCount;
  const candidateDisplayName = getCandidateDisplayName(candidate);
  const rowLabel = `Open details for ${candidateDisplayName}`;
  const stopRowClick = (event: React.SyntheticEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <article
      data-testid={`candidate-row-${candidate._id}`}
      role="button"
      tabIndex={0}
      aria-label={rowLabel}
      className={`group overflow-hidden rounded-[22px] border transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500/70 ${cardSurfaceClass(candidate.matchScore, isInReviewList)}`}
      onClick={onOpenInsights}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenInsights();
        }
      }}
    >
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${isInReviewList ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-700"}`}>
            {(candidateDisplayName[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-950 sm:text-[15px]">{candidateDisplayName}</h3>
              {rank ? (
                <span className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 lg:inline-flex">
                  <Trophy className="h-3 w-3 text-amber-500" />
                  #{rank}
                </span>
              ) : null}
              {isInReviewList ? (
                <span className="hidden rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 lg:inline-flex">
                  Saved
                </span>
              ) : null}
            </div>
            <p className="truncate text-sm text-slate-600">{currentRole ?? "Role not specified"}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs font-medium text-slate-700">{primaryMeta || "Location and experience not specified"}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {visibleSkills.map((skill) => {
              const isRequired = requiredSkills.some((requiredSkill) => normalizeText(requiredSkill) === normalizeText(skill));

              return (
                <span
                  key={skill}
                  className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 font-medium ${isRequired ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}
                >
                  <span className="truncate">{skill}</span>
                </span>
              );
            })}
            {overflowSkillCount > 0 ? <span>+{overflowSkillCount} more</span> : null}
            {selectedJobData && matchedSkills.length === 0 && missingSkills.length > 0 ? (
              <span className="text-amber-700">{missingSkills.length} gap{missingSkills.length === 1 ? "" : "s"}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end" onClick={stopRowClick} onKeyDown={stopRowClick}>
          {hasAnyScore ? (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${scoreBadgeClass(candidate.matchScore)}`}>
              {candidate.matchScore != null ? `${candidate.matchScore}% AI match` : "Unscored"}
            </span>
          ) : null}
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityTone(candidate.availabilityStatus)}`}>
            {candidate.availabilityStatus === "immediately" ? <Zap className="h-3 w-3" /> : null}
            {availabilityLabel}
          </span>
          <Button
            size="sm"
            className="h-8 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={(event) => {
              stopRowClick(event);
              onOpenInsights();
            }}
          >
            View details
          </Button>
          <Button
            size="sm"
            variant={isInReviewList ? "default" : "outline"}
            aria-label={isInReviewList ? "Saved for review" : "Save for review"}
            className={isInReviewList ? "h-8 rounded-lg bg-sky-600 px-2.5 text-xs font-semibold text-white hover:bg-sky-700" : "h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"}
            onClick={(event) => {
              stopRowClick(event);
              onToggleReviewList(candidate._id);
            }}
          >
            <Star className={`h-3.5 w-3.5 ${isInReviewList ? "fill-current" : ""}`} />
            <span className="sr-only">{isInReviewList ? "Saved for review" : "Save for review"}</span>
          </Button>
          {hasSecondaryActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`More actions for ${candidateDisplayName}`}
                  onClick={stopRowClick}
                  className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-2xl border-slate-200 p-1.5">
                {candidate.cv?.originalUrl ? (
                  <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onOpenCv(candidate)}>
                    <FileText className="mr-2 h-4 w-4" />
                    View CV
                  </DropdownMenuItem>
                ) : null}
                {messageRecipientId ? (
                  <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onStartMessage(messageRecipientId)}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Message
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onOpenProfile(candidate._id)}>
                  <Eye className="mr-2 h-4 w-4" />
                  Open profile
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </article>
  );
}

interface CandidateInsightsDialogProps {
  candidate: Candidate | null;
  open: boolean;
  selectedJobData?: CandidateJob;
  isInReviewList: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCv: (candidate: Candidate) => void;
  onOpenProfile: (candidateId: string) => void;
  onStartMessage: (recipientId: string) => void;
  onToggleReviewList: (candidateId: string) => void;
}

function CandidateInsightsDialog({
  candidate,
  open,
  selectedJobData,
  isInReviewList,
  onOpenChange,
  onOpenCv,
  onOpenProfile,
  onStartMessage,
  onToggleReviewList,
}: CandidateInsightsDialogProps) {
  if (!candidate) {
    return null;
  }

  const currentRole = candidate.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? null;
  const matchedSkills = getMatchedSkills(candidate, selectedJobData);
  const missingSkills = getMissingSkills(candidate, selectedJobData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden rounded-[32px] border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.98))] p-0 shadow-[0_40px_120px_-48px_rgba(15,23,42,0.5)]">
        <div className="max-h-[88vh] overflow-y-auto">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] px-6 py-6 sm:px-8">
            <DialogHeader className="gap-3 text-left">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-950">{getCandidateDisplayName(candidate)}</DialogTitle>
                    {isInReviewList ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Review list
                      </span>
                    ) : null}
                    {candidate.matchScore != null ? (
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${scoreBadgeClass(candidate.matchScore)}`}>
                        {candidate.matchScore}% AI match
                      </span>
                    ) : null}
                  </div>
                  <DialogDescription className="mt-1 text-sm text-slate-500">
                    {currentRole ?? "Role not specified"}
                    {candidate.currentLocation ? ` • ${candidate.currentLocation}` : ""}
                    {candidate.totalExperienceYears != null ? ` • ${candidate.totalExperienceYears}+ years experience` : ""}
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {candidate.cv?.originalUrl ? (
                    <Button size="sm" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={() => onOpenCv(candidate)}>
                      <FileText className="mr-2 h-3.5 w-3.5" />
                      View CV
                    </Button>
                  ) : null}
                  {candidate.userId?._id ? (
                    <Button size="sm" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={() => onStartMessage(candidate.userId!._id)}>
                      <MessageSquare className="mr-2 h-3.5 w-3.5" />
                      Message
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={() => onOpenProfile(candidate._id)}>
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    Open profile
                  </Button>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Availability</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {candidate.availabilityStatus === "immediately"
                    ? "Available now"
                    : candidate.availabilityStatus === "within_month"
                      ? "Within 1 month"
                      : candidate.availabilityStatus === "within_3_months"
                        ? "Within 3 months"
                        : candidate.availabilityStatus === "not_available"
                          ? "Not available"
                          : "Unknown"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Profile quality</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{candidate.profileCompleteness != null ? `${candidate.profileCompleteness}% complete` : "Awaiting signals"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Matched skills</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{matchedSkills.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Missing signals</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{missingSkills.length}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="space-y-4">
                {candidate.matchSummary ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">AI summary</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{candidate.matchSummary}</p>
                  </div>
                ) : null}

                {candidate.matchBreakdown ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-sky-600" />
                      <p className="text-sm font-semibold text-slate-950">Score breakdown</p>
                    </div>
                    <div className="space-y-3">
                      {(Object.entries(candidate.matchBreakdown) as Array<[string, number]>).map(([key, value]) => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span className="capitalize">{key}</span>
                            <span className="font-semibold text-slate-700">{value}%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-rose-400"}`}
                              style={{ width: `${value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Key skills</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(candidate.skills ?? []).map((skill) => {
                      const isRequired = matchedSkills.some((matchedSkill) => normalizeText(matchedSkill) === normalizeText(skill));

                      return (
                        <span
                          key={skill}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${isRequired ? "border border-sky-200 bg-sky-50 text-sky-700" : "border border-slate-200 bg-slate-50 text-slate-600"}`}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {candidate.strengths?.length ? (
                  <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/60 p-5">
                    <p className="text-sm font-semibold text-emerald-700">Strengths</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      {candidate.strengths.map((strength) => (
                        <li key={strength} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span>{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(candidate.gaps?.length || selectedJobData) ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Role context</p>
                    {selectedJobData ? (
                      <div className="mt-3 space-y-3 text-sm text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-950">{selectedJobData.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {selectedJobData.location?.isRemote
                              ? "Remote role"
                              : [selectedJobData.location?.city, selectedJobData.location?.country].filter(Boolean).join(", ") || "Location not specified"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Matched requirements</p>
                          <p className="mt-1">{matchedSkills.length > 0 ? matchedSkills.join(", ") : "No required skills matched yet."}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">Choose a job to compare this candidate against a live benchmark.</p>
                    )}
                    {candidate.gaps?.length ? (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="text-sm font-semibold text-rose-600">Gaps</p>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {candidate.gaps.map((gap) => (
                            <li key={gap} className="flex gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                              <span>{gap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5">
              <Button
                size="sm"
                variant={isInReviewList ? "default" : "outline"}
                className={isInReviewList ? "h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" : "h-10 rounded-xl border-slate-200 bg-white px-4 text-sm"}
                onClick={() => onToggleReviewList(candidate._id)}
              >
                <Star className={`mr-2 h-3.5 w-3.5 ${isInReviewList ? "fill-current" : ""}`} />
                {isInReviewList ? "Saved for review" : "Save for review"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployerCandidatesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [selectedJob, setSelectedJob] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState<CandidateScoreFilter>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);
  const [viewingCv, setViewingCv] = useState<{
    url: string; name: string;
    candidate?: { role?: string; experience?: number; skills?: string[]; location?: string };
    aiMatchScore?: number;
    matchBreakdown?: { skills?: number; experience?: number; location?: number; overall?: number };
    strengths?: string[];
    gaps?: string[];
  } | null>(null);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [localCandidates, setLocalCandidates] = useState<Candidate[] | null>(null);
  const [detailCandidateId, setDetailCandidateId] = useState<string | null>(null);
  const [reviewListIds, setReviewListIds] = useState<Set<string>>(new Set());
  const [matchFeedback, setMatchFeedback] = useState<MatchFeedback | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const normalizedLocationFilter = normalizeText(locationFilter);
  const normalizedSkillsFilter = useMemo(
    () => skillsFilter.split(",").map((skill) => normalizeText(skill)).filter(Boolean),
    [skillsFilter]
  );

  const {
    data: jobs = [],
    isLoading: jobsLoading,
    isError: hasJobsError,
    refetch: refetchJobs,
  } = usePublishedJobs();

  const {
    data: candidatesData,
    isLoading: loading,
    isError: hasCandidatesError,
    isFetching: isRefreshingCandidates,
    refetch: refetchCandidates,
  } = useCandidates({ page, limit, search: debouncedSearch, jobId: selectedJob || undefined });
  const startDmMutation = useStartConversation();
  const aiMatchMutation = useAiMatch();

  const candidates = localCandidates ?? candidatesData?.candidates ?? [];
  const total = candidatesData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedJobData: CandidateJob | undefined = jobs.find((j) => j._id === selectedJob);
  const detailCandidate = candidates.find((candidate) => candidate._id === detailCandidateId) ?? null;

  const structuredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (savedOnly && !reviewListIds.has(candidate._id)) {
        return false;
      }

      if (availabilityFilter !== "all" && candidate.availabilityStatus !== availabilityFilter) {
        return false;
      }

      if (normalizedLocationFilter && !normalizeText(candidate.currentLocation).includes(normalizedLocationFilter)) {
        return false;
      }

      if (normalizedSkillsFilter.length > 0) {
        const candidateSkills = new Set((candidate.skills ?? []).map((skill) => normalizeText(skill)));
        const hasSkillMatch = normalizedSkillsFilter.some((skill) => candidateSkills.has(skill));
        if (!hasSkillMatch) {
          return false;
        }
      }

      return true;
    });
  }, [availabilityFilter, candidates, normalizedLocationFilter, normalizedSkillsFilter, reviewListIds, savedOnly]);

  const filteredCandidates = useMemo(
    () => filterCandidatesByScore(structuredCandidates, scoreFilter),
    [scoreFilter, structuredCandidates]
  );
  const hasAnyScore = structuredCandidates.some((candidate) => candidate.matchScore != null);
  const scoreCounts = useMemo(() => getScoreFilterCounts(structuredCandidates), [structuredCandidates]);
  const visibleHighMatchCount = structuredCandidates.filter((candidate) => (candidate.matchScore ?? 0) >= 80).length;
  const readyNowCount = structuredCandidates.filter((candidate) => candidate.availabilityStatus === "immediately").length;
  const scoredCount = structuredCandidates.filter((candidate) => candidate.matchScore != null).length;
  const reviewCount = reviewListIds.size;
  const hasLoadError = hasJobsError || hasCandidatesError;
  const workflowState = getCandidateWorkflowState({
    hasSelectedJob: Boolean(selectedJob),
    selectedJobTitle: selectedJobData?.title,
    hasScores: hasAnyScore,
    reviewCount,
  });

  const hasSearchRefinements = Boolean(
    search.trim() || locationFilter.trim() || skillsFilter.trim() || availabilityFilter !== "all" || scoreFilter !== "all" || savedOnly
  );
  const advancedFilterCount = [skillsFilter.trim().length > 0, scoreFilter !== "all", savedOnly].filter(Boolean).length;
  const availabilityLabel = AVAILABILITY_OPTIONS.find((option) => option.value === availabilityFilter)?.label ?? "Any availability";
  const activeFilterChips = [
    search.trim() ? { key: "search", label: `Search: ${search.trim()}` } : null,
    locationFilter.trim() ? { key: "location", label: `Location: ${locationFilter.trim()}` } : null,
    availabilityFilter !== "all" ? { key: "availability", label: availabilityLabel } : null,
    skillsFilter.trim() ? { key: "skills", label: `Skills: ${skillsFilter.trim()}` } : null,
    scoreFilter !== "all" ? { key: "score", label: SCORE_FILTER_LABELS[scoreFilter] } : null,
    savedOnly ? { key: "saved", label: "Saved only" } : null,
  ].filter((chip): chip is { key: string; label: string } => Boolean(chip));

  function openCandidateCv(candidate: Candidate) {
    if (!candidate.cv?.originalUrl) {
      toast.error("CV not available for this candidate.");
      return;
    }

    setViewingCv({
      url: candidate.cv.originalUrl,
      name: getCandidateDisplayName(candidate),
      candidate: {
        role: candidate.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? undefined,
        skills: candidate.skills,
        location: candidate.currentLocation,
      },
      aiMatchScore: candidate.matchScore,
      matchBreakdown: candidate.matchBreakdown,
      strengths: candidate.strengths,
      gaps: candidate.gaps,
    });
  }

  function applySelectedJob(nextJobId: string) {
    setSelectedJob(nextJobId);
    setPage(1);
    setLocalCandidates(null);
    setScoreFilter("all");
    setDetailCandidateId(null);
    setMatchFeedback(null);
  }

  useEffect(() => {
    const persistedState = safeParseCandidateMatchSessionState(sessionStorage.getItem(MATCH_SESSION_STORAGE_KEY));
    if (persistedState.selectedJobId) setSelectedJob(persistedState.selectedJobId);
    if (persistedState.reviewListIds.length > 0) {
      setReviewListIds(new Set(persistedState.reviewListIds));
    }
  }, []);

  // Reset local overrides when server data changes
  useEffect(() => {
    setLocalCandidates(null);
  }, [candidatesData]);

  useEffect(() => {
    if (!detailCandidateId) {
      return;
    }

    if (!candidates.some((candidate) => candidate._id === detailCandidateId)) {
      setDetailCandidateId(null);
    }
  }, [candidates, detailCandidateId]);

  useEffect(() => {
    sessionStorage.setItem(
      MATCH_SESSION_STORAGE_KEY,
      safeSerializeCandidateMatchSessionState({
        selectedJobId: selectedJob,
        reviewListIds: Array.from(reviewListIds),
      })
    );
  }, [reviewListIds, selectedJob]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedJob]);

  useEffect(() => {
    document.title = "Candidate Matching · MPLOYEDIN";
  }, []);

  useEffect(() => {
    if (!selectedJob || jobs.length === 0) return;

    if (!jobs.some((job) => job._id === selectedJob)) {
      applySelectedJob("");
      setMatchFeedback({
        type: "info",
        message: "The previously selected job is no longer available. Choose another published role to continue.",
      });
    }
  }, [jobs, selectedJob]);

  const runAIMatch = async () => {
    if (!selectedJob || structuredCandidates.length === 0) {
      setMatchFeedback({
        type: "info",
        message: !selectedJob
          ? "Choose a published job before running AI match."
          : "There are no candidates on this page to score yet.",
      });
      return;
    }

    setMatchFeedback(null);
    const toScore = structuredCandidates.slice(0, MAX_AI_MATCH_BATCH_SIZE);
    setMatchProgress({ done: 0, total: toScore.length });

    const results: Candidate[] = [...candidates];
    let done = 0;
    let successCount = 0;
    let failedCount = 0;

    await Promise.allSettled(
      toScore.map(async (candidate) => {
        const jobSeekerId = candidate.userId?._id || candidate._id;

        try {
          const data = await aiMatchMutation.mutateAsync({ jobId: selectedJob, jobSeekerId });
          const index = results.findIndex((entry) => entry._id === candidate._id);

          if (index !== -1) {
            results[index] = {
              ...results[index],
              matchScore: data.score,
              matchBreakdown: data.breakdown,
              matchSummary: data.summary,
              strengths: data.strengths,
              gaps: data.gaps,
            };
          }

          successCount++;
        } catch {
          failedCount++;
        } finally {
          done++;
          setMatchProgress({ done, total: toScore.length });
        }
      })
    );

    setLocalCandidates([...results].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)));
    setScoreFilter("all");
    setMatchProgress(null);

    if (successCount === 0) {
      setMatchFeedback({
        type: "error",
        message: "AI matching could not score candidates right now. Try again in a moment.",
      });
      return;
    }

    setMatchFeedback({
      type: failedCount > 0 ? "info" : "success",
      message: failedCount > 0
        ? `Scored ${successCount} candidate${successCount === 1 ? "" : "s"}. ${failedCount} candidate${failedCount === 1 ? " could not be scored." : "s could not be scored."}`
        : `Scored ${successCount} candidate${successCount === 1 ? "" : "s"} and ranked the page by AI match.`,
    });
  };

  const saveTopMatches = () => {
    const picks = getAutoReviewCandidateIds(structuredCandidates);
    setReviewListIds((prev) => {
      const next = new Set(prev);
      picks.forEach((candidateId) => next.add(candidateId));
      return next;
    });
  };

  const toggleReviewList = (id: string) => {
    setReviewListIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startDM = async (recipientUserId: string) => {
    try {
      const data = await startDmMutation.mutateAsync(recipientUserId);
      router.push(`/${locale}/employer/messages?conv=${data.conversation._id}`);
    } catch {
      setMatchFeedback({
        type: "error",
        message: "Could not open a conversation with this candidate right now.",
      });
    }
  };

  const matchRank = (candidate: Candidate) => {
    if (!hasAnyScore || candidate.matchScore == null) {
      return null;
    }

    const ranked = [...structuredCandidates]
      .filter((entry) => entry.matchScore != null)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    return ranked.findIndex((entry) => entry._id === candidate._id) + 1;
  };

  const matchHelperText = !selectedJob
    ? "Choose a published job to enable AI scoring."
    : structuredCandidates.length === 0
      ? "No candidates are available on this page yet."
      : "AI matching scores the candidates currently visible after your search and filters.";

  async function handleApplyAiSearch() {
    const query = aiQuery.trim();
    if (!query) {
      return;
    }

    setIsApplyingAiSearch(true);
    setMatchFeedback(null);

    try {
      const response = await fetch("/api/ai/candidate-search-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("AI search failed");
      }

      const data = await response.json() as AiCandidateSearchResponse;
      const filters = data.filters ?? {};
      const nextJobId = findMatchingJobId(filters.jobQuery, jobs);

      setSearch(filters.search ?? "");
      setLocationFilter(filters.location ?? "");
      setSkillsFilter(filters.skills?.join(", ") ?? "");
      setAvailabilityFilter(filters.availability && AVAILABILITY_OPTIONS.some((option) => option.value === filters.availability)
        ? filters.availability
        : "all");
      setScoreFilter(filters.scoreBand ?? "all");
      setSavedOnly(false);
      setPage(1);
      setDetailCandidateId(null);
      setAiSummary(data.summary ?? null);
      setShowAdvancedFilters(Boolean((filters.skills?.length ?? 0) > 0 || (filters.scoreBand && filters.scoreBand !== "all")));

      if (nextJobId) {
        applySelectedJob(nextJobId);
      }

      toast.success(data.degraded ? "AI search unavailable. Keyword search applied." : "AI search applied.");
    } catch {
      setSearch(query);
      setPage(1);
      setAiSummary(`AI search was unavailable, so keyword results are being shown for "${query}".`);
      toast.error("AI search unavailable. Keyword search applied instead.");
    } finally {
      setIsApplyingAiSearch(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setLocationFilter("");
    setSkillsFilter("");
    setAvailabilityFilter("all");
    setScoreFilter("all");
    setSavedOnly(false);
    setAiSummary(null);
    setAiQuery("");
    setPage(1);
    setShowAdvancedFilters(false);
  }

  return (
    <div className="page-container space-y-4">
      {viewingCv && (
        <ResumeViewerModal
          url={viewingCv.url}
          candidateName={viewingCv.name}
          onClose={() => setViewingCv(null)}
          candidate={viewingCv.candidate}
          aiMatchScore={viewingCv.aiMatchScore}
          matchBreakdown={viewingCv.matchBreakdown}
          strengths={viewingCv.strengths}
          gaps={viewingCv.gaps}
        />
      )}

      <CandidateInsightsDialog
        candidate={detailCandidate}
        open={Boolean(detailCandidate)}
        selectedJobData={selectedJobData}
        isInReviewList={detailCandidate ? reviewListIds.has(detailCandidate._id) : false}
        onOpenChange={(open) => {
          if (!open) {
            setDetailCandidateId(null);
          }
        }}
        onOpenCv={openCandidateCv}
        onStartMessage={startDM}
        onOpenProfile={(candidateId) => router.push(`/${locale}/employer/candidates/${candidateId}`)}
        onToggleReviewList={toggleReviewList}
      />

      <section className="overflow-hidden rounded-[24px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] px-4 py-4 shadow-[0_20px_48px_-40px_rgba(2,132,199,0.35)] sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[1.7rem] font-semibold tracking-tight text-slate-950">Candidate Matching</h1>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 backdrop-blur">
                {selectedJobData ? `Benchmark: ${selectedJobData.title}` : "Talent pool view"}
              </span>
              {isRefreshingCandidates ? (
                <span className="rounded-full border border-sky-100 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-sky-700 backdrop-blur">
                  Refreshing
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {[
                { label: "Candidates", value: total },
                { label: "Scored", value: scoredCount },
                { label: "High Match", value: visibleHighMatchCount },
                { label: "Available", value: readyNowCount },
              ].map((stat) => (
                  <span key={stat.label} aria-label={`${stat.value} ${stat.label}`} className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-slate-950">{stat.value}</span>
                  <span>{stat.label}</span>
                </span>
              ))}
            </div>
          </div>

          <Button
            onClick={runAIMatch}
            disabled={!selectedJob || !!matchProgress || structuredCandidates.length === 0}
            className="h-9 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
          >
            {matchProgress ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
            {matchProgress ? `Scoring ${matchProgress.done}/${matchProgress.total}` : "Run AI Match"}
          </Button>
        </div>
      </section>

      {hasLoadError && (
        <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 p-4 shadow-[0_16px_40px_-36px_rgba(220,38,38,0.45)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Unable to load all candidate matching data</p>
              <p className="text-sm text-muted-foreground">
                {hasJobsError && hasCandidatesError
                  ? "Published jobs and candidates both failed to load."
                  : hasJobsError
                    ? "Published jobs failed to load."
                    : "Candidates failed to load."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
              className="h-10 shrink-0 rounded-xl border-slate-200 bg-white px-4 text-sm"
            onClick={() => {
              void refetchJobs();
              void refetchCandidates();
            }}
          >
            Retry
          </Button>
            </div>
        </div>
      )}

      {!jobsLoading && !hasJobsError && jobs.length === 0 && (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 text-amber-900 shadow-[0_16px_40px_-36px_rgba(245,158,11,0.45)]">
            <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">No published jobs available yet</p>
            <p className="text-sm text-amber-800/90">Publish a job first so this page has a role to compare candidates against.</p>
          </div>
            </div>
        </div>
      )}

        <section className="rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-[0_20px_48px_-42px_rgba(15,23,42,0.28)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter and act</p>
              <p className="mt-1 text-sm text-slate-600">Search, compare against a role, then open the best profiles quickly.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
              onClick={() => setShowAdvancedFilters((current) => !current)}
            >
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              {showAdvancedFilters ? "Hide filters" : `Advanced${advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}`}
            </Button>
          </div>

          <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(170px,0.7fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search candidates, skills, role, or company"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
              />
            </div>

            <div>
              <SearchableSelect
                className="h-10 w-full rounded-xl border-slate-200 bg-slate-50"
                options={[
                  { value: "none", label: "No job selected" },
                  ...jobs.map((job) => ({ value: job._id, label: job.title })),
                ]}
                value={selectedJob || "none"}
                onValueChange={(value) => applySelectedJob(value === "none" ? "" : value)}
                disabled={jobsLoading || jobs.length === 0}
                placeholder="Compare against job"
              />
            </div>

            <div className="xl:col-span-2">
              <Input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder="Filter by location"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 text-sm shadow-none"
              />
            </div>

            <div>
              <SearchableSelect
                className="h-10 w-full rounded-xl border-slate-200 bg-slate-50"
                options={AVAILABILITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={availabilityFilter}
                onValueChange={setAvailabilityFilter}
                placeholder="Availability"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={aiQuery}
                onChange={(event) => setAiQuery(event.target.value)}
                placeholder="AI search: e.g. high match React candidates in Dubai ready now"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleApplyAiSearch();
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                size="sm"
                className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => { void handleApplyAiSearch(); }}
                disabled={!aiQuery.trim() || isApplyingAiSearch}
              >
                {isApplyingAiSearch ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                {isApplyingAiSearch ? "Applying AI search..." : "Apply AI Search"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm"
                onClick={saveTopMatches}
                disabled={!hasAnyScore || structuredCandidates.length === 0}
              >
                <CheckCheck className="mr-2 h-3.5 w-3.5" />
                Save Top Matches
              </Button>
              {selectedJob && hasAnyScore ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm"
                  onClick={() => router.push(`/${locale}/employer/applications?jobId=${selectedJob}`)}
                >
                  <Target className="mr-2 h-3.5 w-3.5" />
                  Open Applications
                </Button>
              ) : null}
            </div>

          </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">{workflowState.title}</span>
                {reviewCount > 0 ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                    {reviewCount} saved
                  </span>
                ) : null}
                {activeFilterChips.map((chip) => (
                  <span key={chip.key} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {chip.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500">{matchHelperText}</p>
            </div>

            {aiSummary ? (
              <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">{aiSummary}</div>
            ) : null}

            {hasAnyScore ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["all", "high", "good", "low", "unscored"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setScoreFilter(tab)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${scoreFilter === tab ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {SCORE_FILTER_LABELS[tab]}
                    <span className="ml-1.5 opacity-70">({scoreCounts[tab]})</span>
                  </button>
                ))}
              </div>
            ) : null}

            {showAdvancedFilters ? (
              <div className="mt-3 space-y-3 rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
                <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    value={skillsFilter}
                    onChange={(event) => setSkillsFilter(event.target.value)}
                    placeholder="Skills, comma separated"
                    className="h-10 rounded-xl border-slate-200 bg-white text-sm shadow-none"
                  />
                  <Button
                    size="sm"
                    variant={savedOnly ? "default" : "outline"}
                    className={savedOnly ? "h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" : "h-10 rounded-xl border-slate-200 bg-white px-4 text-sm"}
                    onClick={() => setSavedOnly((current) => !current)}
                  >
                    <Star className={`mr-2 h-3.5 w-3.5 ${savedOnly ? "fill-current" : ""}`} />
                    Saved
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={resetFilters} disabled={!hasSearchRefinements && !aiSummary}>
                    Reset filters
                  </Button>
                </div>

                <div className="flex flex-col gap-2 text-xs text-slate-500 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    {selectedJobData ? (
                      <span>
                        Benchmarking against <span className="font-semibold text-slate-700">{selectedJobData.title}</span>
                        {selectedJobData.requirements?.skills?.length ? ` with ${selectedJobData.requirements.skills.length} tracked skill requirement${selectedJobData.requirements.skills.length === 1 ? "" : "s"}.` : "."}
                      </span>
                    ) : (
                      workflowState.description
                    )}
                  </div>
                  {reviewCount > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-lg px-3 text-xs text-slate-600 hover:bg-slate-100"
                      onClick={() => setReviewListIds(new Set())}
                    >
                      Clear review list
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {AI_SEARCH_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                      onClick={() => setAiQuery(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

          {matchFeedback && (
            <div
              className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                matchFeedback.type === "error"
                  ? "border-destructive/20 bg-destructive/5 text-slate-950"
                  : matchFeedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {matchFeedback.message}
            </div>
          )}

          {matchProgress ? (
            <div className="mt-3 space-y-2" aria-live="polite" aria-atomic="true">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-600 transition-all duration-300"
                  style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">Scoring candidate {matchProgress.done} of {matchProgress.total} on the current page...</p>
            </div>
          ) : null}
        </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[88px] animate-pulse rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_18px_40px_-40px_rgba(15,23,42,0.22)]" />
          ))}
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] px-6 py-12 text-center shadow-[0_20px_48px_-42px_rgba(15,23,42,0.28)]">
          <Users className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Candidate view</p>
          <h3 className="mt-3 text-xl font-semibold text-slate-950">No candidates match this view</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {hasSearchRefinements
              ? "Adjust the search, loosen the filters, or try the AI search box to broaden the review queue."
              : "No job seeker profiles exist yet, or the selected role does not have candidates on this page."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCandidates.map((candidate) => {
            const rank = matchRank(candidate);
            const isInReviewList = reviewListIds.has(candidate._id);

            return (
              <CandidateMatchCard
                key={candidate._id}
                candidate={candidate}
                selectedJobData={selectedJobData}
                hasAnyScore={hasAnyScore}
                rank={rank}
                isInReviewList={isInReviewList}
                onOpenCv={openCandidateCv}
                onStartMessage={startDM}
                onOpenProfile={(candidateId) => router.push(`/${locale}/employer/candidates/${candidateId}`)}
                onToggleReviewList={toggleReviewList}
                onOpenInsights={() => setDetailCandidateId(candidate._id)}
              />
            );
          })}
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
}

