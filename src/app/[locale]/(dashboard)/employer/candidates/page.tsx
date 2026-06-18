"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCandidates, usePublishedJobs, useStartConversation, useAiMatch, useScreenCandidates, useInviteToApply } from "@/hooks/useCandidates";
import { useDebounce } from "@/hooks/useDebounce";
import { useTableExport } from "@/hooks/useTableExport";
import type { Candidate, CandidateJob, ScreenedCandidate } from "@/hooks/useCandidates";
import type { ExportColumn } from "@/lib/export";
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
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

const MATCH_SESSION_STORAGE_KEY = "employer-candidate-matching-session-v1";
const MAX_AI_MATCH_BATCH_SIZE = 20;
const AI_SEARCH_SUGGESTIONS = [
  "High match React candidates in Dubai ready now",
  "Frontend candidates with TypeScript and Node.js",
  "Saved candidates available within one month",
];

// AVAILABILITY_OPTIONS and SCORE_FILTER_LABELS moved into EmployerCandidatesPage as useMemo (needs t())

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
  if (score == null) return "border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300";
  if (score >= 80) return "border border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (score >= 60) return "border border-amber-300 bg-amber-50 text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300";
  return "border border-rose-300 bg-rose-50 text-rose-700 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300";
};

const cardSurfaceClass = (score?: number, savedForReview?: boolean) => {
  if (savedForReview) {
    return "border-sky-200 bg-[linear-gradient(180deg,_rgba(240,249,255,0.96),_rgba(255,255,255,0.98))] shadow-[0_24px_60px_-44px_rgba(14,165,233,0.45)] dark:border-sky-500/30 dark:bg-[linear-gradient(180deg,_rgba(8,47,73,0.92),_rgba(15,23,42,0.96))]";
  }

  if (score != null && score >= 80) {
    return "border-emerald-200 bg-[linear-gradient(180deg,_rgba(236,253,245,0.96),_rgba(255,255,255,0.98))] shadow-[0_24px_60px_-44px_rgba(16,185,129,0.35)] dark:border-emerald-500/25 dark:bg-[linear-gradient(180deg,_rgba(6,78,59,0.88),_rgba(15,23,42,0.96))]";
  }

  return "border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.98))]";
};

const availabilityTone = (status?: string) => {
  switch (status) {
    case "immediately":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "within_month":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300";
    case "within_3_months":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300";
    case "not_available":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300";
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
  return accountName || "Unknown candidate"; // dynamic fallback, translated via caller
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
  onInvite?: (candidateId: string) => void;
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
  onInvite,
  onOpenInsights,
}: CandidateCardProps) {
  const t = useTranslations("employerCandidates");
  const currentRole = candidate.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? null;
  const matchedSkills = getMatchedSkills(candidate, selectedJobData);
  const missingSkills = getMissingSkills(candidate, selectedJobData);
  const requiredSkills = selectedJobData?.requirements?.skills ?? [];
  const topSkills = (candidate.skills ?? []).slice(0, 3);
  const extraSkillCount = Math.max(0, (candidate.skills?.length ?? 0) - topSkills.length);
  const messageRecipientId = candidate.userId?._id;
  const hasSecondaryActions = Boolean(candidate.cv?.originalUrl || candidate.userId?._id || candidate._id);
  const availabilityLabel = candidate.availabilityStatus === "immediately"
    ? t("availableNow")
    : candidate.availabilityStatus === "within_month"
      ? t("withinMonth")
      : candidate.availabilityStatus === "within_3_months"
        ? t("within3Months")
        : candidate.availabilityStatus === "not_available"
          ? t("notAvailable")
          : t("availabilityUnknown");

  const primaryMeta = [candidate.currentLocation, candidate.totalExperienceYears != null ? t("yrsExperience", { years: candidate.totalExperienceYears }) : null]
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
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${isInReviewList ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300"}`}>
            {(candidateDisplayName[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground sm:text-[15px]">{candidateDisplayName}</h3>
              {rank ? (
                <span className="hidden items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground lg:inline-flex">
                  <Trophy className="h-3 w-3 text-amber-500" />
                  #{rank}
                </span>
              ) : null}
              {isInReviewList ? (
                <span className="hidden rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 lg:inline-flex">
                  {t("savedLabel")}
                </span>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">{currentRole ?? t("roleNotSpecified")}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs font-medium text-foreground/85">{primaryMeta || t("locationExpNotSpecified")}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {visibleSkills.map((skill) => {
              const isRequired = requiredSkills.some((requiredSkill) => normalizeText(requiredSkill) === normalizeText(skill));

              return (
                <span
                  key={skill}
                  className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 font-medium ${isRequired ? "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300"}`}
                >
                  <span className="truncate">{skill}</span>
                </span>
              );
            })}
            {overflowSkillCount > 0 ? <span>+{overflowSkillCount} {t("moreSuffix")}</span> : null}
            {selectedJobData && matchedSkills.length === 0 && missingSkills.length > 0 ? (
              <span className="text-amber-700 dark:text-amber-300">{missingSkills.length === 1 ? t("skillGap", { count: missingSkills.length }) : t("skillGaps", { count: missingSkills.length })}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end" onClick={stopRowClick} onKeyDown={stopRowClick}>
          {hasAnyScore ? (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${scoreBadgeClass(candidate.matchScore)}`}>
              {candidate.matchScore != null ? `${candidate.matchScore}% ${t("aiMatchSuffix")}` : t("unscored")}
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
            {t("viewDetails")}
          </Button>
          <Button
            size="sm"
            variant={isInReviewList ? "default" : "outline"}
            aria-label={isInReviewList ? t("savedForReview") : t("saveForReview")}
            className={isInReviewList ? "h-8 rounded-lg bg-sky-600 px-2.5 text-xs font-semibold text-white hover:bg-sky-700" : "h-8 rounded-lg border-border bg-background/80 px-2.5 text-xs"}
            onClick={(event) => {
              stopRowClick(event);
              onToggleReviewList(candidate._id);
            }}
          >
            <Star className={`h-3.5 w-3.5 ${isInReviewList ? "fill-current" : ""}`} />
            <span className="sr-only">{isInReviewList ? t("savedForReview") : t("saveForReview")}</span>
          </Button>
          {hasSecondaryActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("moreActions", { name: candidateDisplayName })}
                  onClick={stopRowClick}
                  className="h-8 rounded-lg border-border bg-background/80 px-2.5 text-xs font-medium text-foreground/85"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">{t("moreLabel")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-2xl border-border bg-popover p-1.5">
                {candidate.cv?.originalUrl ? (
                  <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onOpenCv(candidate)}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t("viewCv")}
                  </DropdownMenuItem>
                ) : null}
                {messageRecipientId ? (
                  <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onStartMessage(messageRecipientId)}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t("messageAction")}
                  </DropdownMenuItem>
                ) : null}
                {onInvite ? (
                  <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onInvite(candidate._id)}>
                    <Send className="mr-2 h-4 w-4" />
                    {t("inviteToApply")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onOpenProfile(candidate._id)}>
                  <Eye className="mr-2 h-4 w-4" />
                  {t("openProfile")}
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
  const t = useTranslations("employerCandidates");
  if (!candidate) {
    return null;
  }

  const currentRole = candidate.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? null;
  const matchedSkills = getMatchedSkills(candidate, selectedJobData);
  const missingSkills = getMissingSkills(candidate, selectedJobData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden rounded-[32px] border-border bg-background p-0 shadow-[0_40px_120px_-48px_rgba(15,23,42,0.5)]">
        <div className="max-h-[88vh] overflow-y-auto">
          <div className="border-b border-border bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] px-6 py-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_34%),linear-gradient(135deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.92))] sm:px-8">
            <DialogHeader className="gap-3 text-left">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">{getCandidateDisplayName(candidate)}</DialogTitle>
                    {isInReviewList ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:text-sky-300">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("reviewList")}
                      </span>
                    ) : null}
                    {candidate.matchScore != null ? (
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${scoreBadgeClass(candidate.matchScore)}`}>
                        {t("aiMatchPercent", { score: candidate.matchScore })}
                      </span>
                    ) : null}
                  </div>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    {currentRole ?? t("roleNotSpecified")}
                    {candidate.currentLocation ? ` • ${candidate.currentLocation}` : ""}
                    {candidate.totalExperienceYears != null ? ` • ${t("yearsExperience", { years: candidate.totalExperienceYears })}` : ""}
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {candidate.cv?.originalUrl ? (
                    <Button size="sm" variant="outline" className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm" onClick={() => onOpenCv(candidate)}>
                      <FileText className="mr-2 h-3.5 w-3.5" />
                      {t("viewCv")}
                    </Button>
                  ) : null}
                  {candidate.userId?._id ? (
                    <Button size="sm" variant="outline" className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm" onClick={() => onStartMessage(candidate.userId!._id)}>
                      <MessageSquare className="mr-2 h-3.5 w-3.5" />
                      {t("messageAction")}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm" onClick={() => onOpenProfile(candidate._id)}>
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    {t("openProfile")}
                  </Button>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="workspace-glass-panel rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("availability")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {candidate.availabilityStatus === "immediately"
                    ? t("availableNow")
                    : candidate.availabilityStatus === "within_month"
                      ? t("withinMonth")
                      : candidate.availabilityStatus === "within_3_months"
                        ? t("within3Months")
                        : candidate.availabilityStatus === "not_available"
                          ? t("notAvailable")
                          : t("unknown")}
                </p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("profileQuality")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{candidate.profileCompleteness != null ? t("percentComplete", { percent: candidate.profileCompleteness }) : t("awaitingSignals")}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{selectedJobData ? t("matchedSkills") : t("keySkills")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedJobData ? matchedSkills.length : (candidate.skills?.length ?? 0)}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("missingSignals")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedJobData ? missingSkills.length : "—"}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="space-y-4">
                {candidate.matchSummary ? (
                  <div className="workspace-glass-panel rounded-[24px] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("aiSummary")}</p>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{candidate.matchSummary}</p>
                  </div>
                ) : null}

                {candidate.matchBreakdown ? (
                  <div className="workspace-glass-panel rounded-[24px] p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-sky-600" />
                      <p className="text-sm font-semibold text-foreground">{t("scoreBreakdown")}</p>
                    </div>
                    <div className="space-y-3">
                      {(Object.entries(candidate.matchBreakdown) as Array<[string, number]>).map(([key, value]) => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span className="capitalize">{key}</span>
                            <span className="font-semibold text-foreground/85">{value}%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-muted/50">
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("keySkills")}</p>
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
                    <p className="text-sm font-semibold text-emerald-700">{t("strengths")}</p>
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("roleContext")}</p>
                    {selectedJobData ? (
                      <div className="mt-3 space-y-3 text-sm text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-950">{selectedJobData.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {selectedJobData.location?.isRemote
                              ? t("remoteRole")
                              : [selectedJobData.location?.city, selectedJobData.location?.country].filter(Boolean).join(", ") || t("locationNotSpecified")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("matchedRequirements")}</p>
                          <p className="mt-1">{matchedSkills.length > 0 ? matchedSkills.join(", ") : t("noRequirementsMatched")}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">{t("chooseJobBenchmark")}</p>
                    )}
                    {candidate.gaps?.length ? (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="text-sm font-semibold text-rose-600">{t("gaps")}</p>
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
                {isInReviewList ? t("savedForReview") : t("saveForReview")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── AI Screening Results Panel ──────────────────────────────────── */
const RECOMMENDATION_STYLES: Record<string, string> = {
  shortlist: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  consider: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  pass: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
};

interface ScreeningPanelProps {
  results: ScreenedCandidate[];
  jobTitle: string;
  totalReviewed: number;
  onClose: () => void;
}

function AIScreeningResultsPanel({ results, jobTitle, totalReviewed, onClose }: ScreeningPanelProps) {
  const t = useTranslations("employerCandidates");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const shortlistCount = results.filter((c) => c.recommendation === "shortlist").length;
  const considerCount = results.filter((c) => c.recommendation === "consider").length;
  const passCount = results.filter((c) => c.recommendation === "pass").length;

  return (
    <section className="workspace-panel-surface rounded-[24px] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-semibold text-foreground">{t("aiScreeningResults")}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("screenedCandidates")} <span className="font-semibold text-foreground">{totalReviewed}</span> {t("candidatesFor")} <span className="font-semibold text-foreground">{jobTitle}</span>
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-9 rounded-xl border-border bg-background/80 px-3 text-xs" onClick={onClose}>
          <XCircle className="mr-2 h-3.5 w-3.5" />
          {t("dismiss")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="workspace-glass-panel rounded-2xl p-3 text-center">
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{shortlistCount}</p>
          <p className="text-xs font-medium text-muted-foreground">{t("shortlist")}</p>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-3 text-center">
          <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{considerCount}</p>
          <p className="text-xs font-medium text-muted-foreground">{t("consider")}</p>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-3 text-center">
          <p className="text-2xl font-semibold text-rose-600 dark:text-rose-400">{passCount}</p>
          <p className="text-xs font-medium text-muted-foreground">{t("pass")}</p>
        </div>
      </div>

      <div className="space-y-2">
        {results.map((candidate, idx) => {
          const isExpanded = expandedId === candidate.id;
          return (
            <div
              key={candidate.id}
              className={`overflow-hidden rounded-[18px] border transition-colors ${RECOMMENDATION_STYLES[candidate.recommendation] ?? "border-border bg-background"}`}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpandedId(isExpanded ? null : candidate.id)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold dark:bg-white/10">
                  #{idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{candidate.name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${scoreBadgeClass(candidate.score)}`}>
                      {candidate.score}%
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs opacity-80">{candidate.summary}</p>
                </div>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {candidate.recommendation}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {isExpanded && (
                <div className="border-t border-current/10 px-4 py-3 space-y-3">
                  {candidate.strengths.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold">{t("strengths")}</p>
                      <ul className="mt-1 space-y-1">
                        {candidate.strengths.map((s) => (
                          <li key={s} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {candidate.gaps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold">{t("gaps")}</p>
                      <ul className="mt-1 space-y-1">
                        {candidate.gaps.map((g) => (
                          <li key={g} className="flex items-start gap-2 text-xs">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function EmployerCandidatesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("employerCandidates");

  const AVAILABILITY_OPTIONS = useMemo(() => [
    { value: "all", label: t("anyAvailability") },
    { value: "immediately", label: t("availableNow") },
    { value: "within_month", label: t("withinMonth") },
    { value: "within_3_months", label: t("within3Months") },
    { value: "not_available", label: t("notAvailable") },
  ], [t]);

  const SCORE_FILTER_LABELS: Record<CandidateScoreFilter, string> = useMemo(() => ({
    all: t("allScores"),
    high: t("highMatch"),
    good: t("goodFit"),
    low: t("lowFit"),
    unscored: t("unscored"),
  }), [t]);

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
    jobSeekerId?: string;
    atsScore?: number;
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
  const [screeningResults, setScreeningResults] = useState<{
    candidates: ScreenedCandidate[];
    jobTitle: string;
    totalReviewed: number;
  } | null>(null);
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
  const screenMutation = useScreenCandidates();
  const inviteMutation = useInviteToApply();

  const candidates = localCandidates ?? candidatesData?.candidates ?? [];
  const total = candidatesData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedJobData: CandidateJob | undefined = jobs.find((j) => j._id === selectedJob);
  const detailCandidate = candidates.find((candidate) => candidate._id === detailCandidateId) ?? null;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Name", key: "fullName", formatter: (v, r) => String(v ?? (r as Record<string, any>).userId?.name ?? "Unknown") },
    { header: "Location", key: "currentLocation", formatter: (v) => String(v ?? "—") },
    { header: "Experience (yrs)", key: "totalExperienceYears", formatter: (v) => v != null ? String(v) : "—" },
    { header: "Skills", key: "skills", formatter: (v) => Array.isArray(v) ? v.slice(0, 5).join(", ") : "—" },
    { header: "AI Match", key: "matchScore", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: "Availability", key: "availabilityStatus", formatter: (v) => String(v ?? "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: candidates as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "candidates",
    title: "Candidates",
  });

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
  const workflowStateRaw = getCandidateWorkflowState({
    hasSelectedJob: Boolean(selectedJob),
    selectedJobTitle: selectedJobData?.title,
    hasScores: hasAnyScore,
    reviewCount,
  });

  // Override with translated strings
  const workflowTitle = !selectedJob
    ? t("workflowStep1Title")
    : !hasAnyScore
      ? t("workflowStep2Title", { jobTitle: selectedJobData?.title ?? "" })
      : reviewCount === 0
        ? t("workflowStep3Title")
        : t("workflowDoneTitle", { count: reviewCount });
  const workflowState = { ...workflowStateRaw, title: workflowTitle };

  const hasSearchRefinements = Boolean(
    search.trim() || locationFilter.trim() || skillsFilter.trim() || availabilityFilter !== "all" || scoreFilter !== "all" || savedOnly
  );
  const advancedFilterCount = [skillsFilter.trim().length > 0, scoreFilter !== "all", savedOnly].filter(Boolean).length;
  const availabilityLabel = AVAILABILITY_OPTIONS.find((option) => option.value === availabilityFilter)?.label ?? t("anyAvailability");
  const activeFilterChips = [
    search.trim() ? { key: "search", label: `Search: ${search.trim()}` } : null,
    locationFilter.trim() ? { key: "location", label: `Location: ${locationFilter.trim()}` } : null,
    availabilityFilter !== "all" ? { key: "availability", label: availabilityLabel } : null,
    skillsFilter.trim() ? { key: "skills", label: `Skills: ${skillsFilter.trim()}` } : null,
    scoreFilter !== "all" ? { key: "score", label: SCORE_FILTER_LABELS[scoreFilter] } : null,
    savedOnly ? { key: "saved", label: t("savedLabel") } : null,
  ].filter((chip): chip is { key: string; label: string } => Boolean(chip));

  function openCandidateCv(candidate: Candidate) {
    if (!candidate.cv?.originalUrl) {
      toast.error(t("cvNotAvailable"));
      return;
    }

    // Close the candidate insights dialog so the CV viewer is not stacked behind it.
    setDetailCandidateId(null);

    const ext = candidate.cv.originalUrl.split("?")[0].split(".").pop()?.toLowerCase() || "pdf";

    setViewingCv({
      // Stream the CV through our own origin so the browser renders it inline
      // instead of downloading the cross-origin CDN object. The hash keeps the
      // viewer's PDF/image detection working without affecting the request.
      url: `/api/employers/candidates/${candidate._id}/cv#cv.${ext}`,
      name: getCandidateDisplayName(candidate),
      jobSeekerId: candidate._id,
      atsScore: candidate.cv?.atsScore,
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
    document.title = t("heroTitle") + " · MPLOYEDIN";
  }, []);

  useEffect(() => {
    if (!selectedJob || jobs.length === 0) return;

    if (!jobs.some((job) => job._id === selectedJob)) {
      applySelectedJob("");
      setMatchFeedback({
        type: "info",
        message: t("jobNoLongerAvailable"),
      });
    }
  }, [jobs, selectedJob]);

  const runAIMatch = async () => {
    if (!selectedJob || structuredCandidates.length === 0) {
      setMatchFeedback({
        type: "info",
        message: !selectedJob
          ? t("chooseJobBeforeMatch")
          : t("noCandidatesToScore"),
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
        message: t("aiMatchError"),
      });
      return;
    }

    setMatchFeedback({
      type: failedCount > 0 ? "info" : "success",
      message: failedCount > 0
        ? t("scoredWithFails", { success: successCount, failed: failedCount })
        : t("scoredSuccess", { success: successCount }),
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

  const runAIScreening = async () => {
    if (!selectedJob) {
      setMatchFeedback({ type: "info", message: t("chooseJobBeforeScreening") });
      return;
    }
    setScreeningResults(null);
    setMatchFeedback(null);
    try {
      const data = await screenMutation.mutateAsync({ jobId: selectedJob, maxCandidates: 20 });
      setScreeningResults(data);
      toast.success(t("aiScreenedToast", { total: data.totalReviewed, jobTitle: data.jobTitle }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("screeningFailed");
      setMatchFeedback({ type: "error", message });
    }
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
        message: t("messageFailed"),
      });
    }
  };

  // FG-4: invite a sourced candidate to apply to the currently selected job.
  const inviteToApply = async (candidateId: string) => {
    if (!selectedJob) {
      toast.error(t("inviteSelectJob"));
      return;
    }
    try {
      await inviteMutation.mutateAsync({ jobSeekerId: candidateId, jobId: selectedJob });
      toast.success(t("inviteSent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("inviteFailed"));
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
    ? t("chooseJobForScoring")
    : structuredCandidates.length === 0
      ? t("noCandidatesYet")
      : t("aiMatchDescription");

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

      toast.success(data.degraded ? t("aiSearchDegraded") : t("aiSearchApplied"));
    } catch {
      setSearch(query);
      setPage(1);
      setAiSummary(t("aiSearchFallback", { query }));
      toast.error(t("aiSearchFailed"));
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
    <div className="page-container employer-legacy-surface space-y-4">
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
          jobSeekerId={viewingCv.jobSeekerId}
          jobId={selectedJob || undefined}
          initialAtsScore={viewingCv.atsScore}
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

      <section className="workspace-hero-surface overflow-hidden rounded-[24px] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[1.7rem] font-semibold tracking-tight text-foreground">{t("heroTitle")}</h1>
              <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                {selectedJobData ? t("benchmark", { title: selectedJobData.title }) : t("talentPoolView")}
              </span>
              {isRefreshingCandidates ? (
                <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 backdrop-blur dark:text-sky-300">
                  {t("refreshing")}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {[
                { label: t("statCandidates"), value: total },
                { label: t("statScored"), value: scoredCount },
                { label: t("statHighMatch"), value: visibleHighMatchCount },
                { label: t("statAvailable"), value: readyNowCount },
              ].map((stat) => (
                  <span key={stat.label} aria-label={`${stat.value} ${stat.label}`} className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{stat.value}</span>
                  <span>{stat.label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={runAIMatch}
              disabled={!selectedJob || !!matchProgress || structuredCandidates.length === 0}
              className="h-9 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {matchProgress ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
              {matchProgress ? `${t("scoringProgress")} ${matchProgress.done}/${matchProgress.total}` : t("runAiMatch")}
            </Button>
            <Button
              onClick={runAIScreening}
              disabled={!selectedJob || screenMutation.isPending}
              variant="outline"
              className="h-9 rounded-xl border-border bg-background/80 px-4 text-sm font-semibold"
            >
              {screenMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
              {screenMutation.isPending ? t("screeningInProgress") : t("screenWithAi")}
            </Button>
          </div>
        </div>
      </section>

      {screeningResults && (
        <AIScreeningResultsPanel
          results={screeningResults.candidates}
          jobTitle={screeningResults.jobTitle}
          totalReviewed={screeningResults.totalReviewed}
          onClose={() => setScreeningResults(null)}
        />
      )}

      {hasLoadError && (
        <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 p-4 shadow-[0_16px_40px_-36px_rgba(220,38,38,0.45)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t("unableToLoad")}</p>
              <p className="text-sm text-muted-foreground">
                {hasJobsError && hasCandidatesError
                  ? t("jobsAndCandidatesFailed")
                  : hasJobsError
                    ? t("jobsFailed")
                    : t("candidatesFailed")}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
              className="h-10 shrink-0 rounded-xl border-border bg-background/80 px-4 text-sm"
            onClick={() => {
              void refetchJobs();
              void refetchCandidates();
            }}
          >
            {t("retryButton")}
          </Button>
            </div>
        </div>
      )}

      {!jobsLoading && !hasJobsError && jobs.length === 0 && (
          <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/10 p-4 text-amber-900 shadow-[0_16px_40px_-36px_rgba(245,158,11,0.45)] dark:text-amber-100">
            <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("noPublishedJobs")}</p>
              <p className="text-sm text-amber-800/90 dark:text-amber-100/80">{t("publishJobFirst")}</p>
          </div>
            </div>
        </div>
      )}

          <section className="workspace-panel-surface rounded-[24px] p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterAndActLabel")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("filterAndActDescription")}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
                className="h-9 rounded-xl border-border bg-background/80 px-3 text-xs font-semibold text-foreground/85"
              onClick={() => setShowAdvancedFilters((current) => !current)}
            >
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              {showAdvancedFilters ? t("advancedFilters") : `${t("advancedFilters")}${advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}`}
            </Button>
          </div>

          <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(170px,0.7fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-10 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
              />
            </div>

            <div>
              <SearchableSelect
                className="h-10 w-full rounded-xl border-border bg-background/70"
                options={[
                  { value: "none", label: t("noJobSelected") },
                  ...jobs.map((job) => ({ value: job._id, label: job.title })),
                ]}
                value={selectedJob || "none"}
                onValueChange={(value) => applySelectedJob(value === "none" ? "" : value)}
                disabled={jobsLoading || jobs.length === 0}
                placeholder={t("compareAgainstJob")}
              />
            </div>

            <div className="xl:col-span-2">
              <Input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder={t("filterByLocation")}
                className="h-10 rounded-xl border-border bg-background/70 text-sm shadow-none"
              />
            </div>

            <div>
              <SearchableSelect
                className="h-10 w-full rounded-xl border-border bg-background/70"
                options={AVAILABILITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={availabilityFilter}
                onValueChange={setAvailabilityFilter}
                placeholder={t("availability")}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={aiQuery}
                onChange={(event) => setAiQuery(event.target.value)}
                placeholder={t("aiSearchPlaceholder")}
                className="h-10 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
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
                {isApplyingAiSearch ? t("applyingAiSearch") : t("applyAiSearch")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm"
                onClick={saveTopMatches}
                disabled={!hasAnyScore || structuredCandidates.length === 0}
              >
                <CheckCheck className="mr-2 h-3.5 w-3.5" />
                {t("saveTopMatches")}
              </Button>
              {selectedJob && hasAnyScore ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm"
                  onClick={() => router.push(`/${locale}/employer/applications?jobId=${selectedJob}`)}
                >
                  <Target className="mr-2 h-3.5 w-3.5" />
                  {t("openApplications")}
                </Button>
              ) : null}
            </div>

          </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{workflowState.title}</span>
                {reviewCount > 0 ? (
                  <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    {reviewCount} {t("savedCount")}
                  </span>
                ) : null}
                {activeFilterChips.map((chip) => (
                  <span key={chip.key} className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {chip.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{matchHelperText}</p>
            </div>

            {aiSummary ? (
              <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">{aiSummary}</div>
            ) : null}

            {hasAnyScore ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["all", "high", "good", "low", "unscored"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setScoreFilter(tab)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${scoreFilter === tab ? "border-slate-950 bg-slate-950 text-white dark:border-sky-400 dark:bg-sky-500/20 dark:text-sky-100" : "border-border bg-background/80 text-muted-foreground hover:border-border hover:bg-background"}`}
                  >
                    {SCORE_FILTER_LABELS[tab]}
                    <span className="ml-1.5 opacity-70">({scoreCounts[tab]})</span>
                  </button>
                ))}
              </div>
            ) : null}

            {showAdvancedFilters ? (
              <div className="mt-3 space-y-3 rounded-[20px] border border-border bg-background/60 p-3">
                <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    value={skillsFilter}
                    onChange={(event) => setSkillsFilter(event.target.value)}
                    placeholder="Skills, comma separated"
                    className="h-10 rounded-xl border-border bg-background/80 text-sm shadow-none"
                  />
                  <Button
                    size="sm"
                    variant={savedOnly ? "default" : "outline"}
                    className={savedOnly ? "h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" : "h-10 rounded-xl border-border bg-background/80 px-4 text-sm"}
                    onClick={() => setSavedOnly((current) => !current)}
                  >
                    <Star className={`mr-2 h-3.5 w-3.5 ${savedOnly ? "fill-current" : ""}`} />
                    Saved
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm" onClick={resetFilters} disabled={!hasSearchRefinements && !aiSummary}>
                    Reset filters
                  </Button>
                </div>

                <div className="flex flex-col gap-2 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    {selectedJobData ? (
                      <span>
                        Benchmarking against <span className="font-semibold text-foreground/85">{selectedJobData.title}</span>
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
                      className="h-8 rounded-lg px-3 text-xs text-muted-foreground hover:bg-background/80"
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
                      className="rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-sky-500/20 hover:text-sky-700 dark:hover:text-sky-300"
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
                  ? "border-destructive/20 bg-destructive/5 text-foreground"
                  : matchFeedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-border bg-background/60 text-foreground/85"
              }`}
            >
              {matchFeedback.message}
            </div>
          )}

          {matchProgress ? (
            <div className="mt-3 space-y-2" aria-live="polite" aria-atomic="true">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-sky-600 transition-all duration-300"
                  style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Scoring candidate {matchProgress.done} of {matchProgress.total} on the current page...</p>
            </div>
          ) : null}
        </section>

      <TableToolbar
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

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
          <h3 className="mt-3 text-xl font-semibold text-slate-950">{t("noCandidatesMatch")}</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {hasSearchRefinements
              ? t("adjustSearchHint")
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
                onInvite={inviteToApply}
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

