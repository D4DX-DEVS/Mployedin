"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AI_MATCH_HIGH_THRESHOLD } from "@/lib/constants";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { SaveToPoolDialog } from "@/components/features/employer/SaveToPoolDialog";
import { ScoreRing, matchBandLabel } from "@/components/features/employer/candidates/ScoreRing";
import { CandidateDetailPanel } from "@/components/features/employer/candidates/CandidateDetailPanel";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { PageHero } from "@/components/shared/PageHero";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  Layers,
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
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";

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
  if (score == null) return "border border-border bg-card text-muted-foreground shadow-sm";
  if (score >= 80) return "border border-status-selected/20 bg-status-selected-bg text-status-selected shadow-sm";
  if (score >= 60) return "border border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted shadow-sm";
  return "border border-status-rejected/20 bg-status-rejected-bg text-status-rejected shadow-sm";
};

const cardSurfaceClass = (score?: number, savedForReview?: boolean) => {
  // ponytail: light gradients with dark mode neutral shadow fallback
  if (savedForReview) {
    return "border-status-applied/20 workspace-panel-surface shadow-[0_24px_60px_-44px_rgba(14,165,233,0.45)]";
  }

  if (score != null && score >= 80) {
    return "border-status-selected/20 workspace-panel-surface shadow-[0_24px_60px_-44px_rgba(16,185,129,0.35)]";
  }

  return "border-border workspace-panel-surface shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]";
};

const availabilityTone = (status?: string) => {
  switch (status) {
    case "immediately":
      return "border-status-selected/20 bg-status-selected-bg text-status-selected";
    case "within_month":
      return "border-status-applied/20 bg-status-applied-bg text-status-applied";
    case "within_3_months":
      return "border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted";
    case "not_available":
      return "border-status-rejected/20 bg-status-rejected-bg text-status-rejected";
    default:
      return "border-border bg-secondary/75 text-muted-foreground";
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

/**
 * Tracks whether the observed container is at least `minWidth` px wide.
 * Container-based (not viewport-based) so the layout reacts to the real space
 * left after the dashboard nav rail, instead of the full window width.
 */
function useContainerWide(minWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsWide(width >= minWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);
  return [ref, isWide] as const;
}

interface CandidateCardProps {
  candidate: Candidate;
  selectedJobData?: CandidateJob;
  hasAnyScore: boolean;
  rank: number | null;
  isInReviewList: boolean;
  isSelected: boolean;
  onOpenCv: (candidate: Candidate) => void;
  onOpenProfile: (candidateId: string) => void;
  onStartMessage: (recipientId: string) => void;
  onToggleReviewList: (candidateId: string) => void;
  onInvite?: (candidateId: string) => void;
  onOpenInsights: () => void;
  onSaveToPool?: (candidate: Candidate) => void;
}

function CandidateMatchCard({
  candidate,
  selectedJobData,
  hasAnyScore,
  rank,
  isInReviewList,
  isSelected,
  onOpenCv,
  onOpenProfile,
  onStartMessage,
  onToggleReviewList,
  onInvite,
  onOpenInsights,
  onSaveToPool,
}: CandidateCardProps) {
  const t = useTranslations("employerCandidates");
  const tMatch = useTranslations("employerCompliance.match");
  const tp = useTranslations("talentPool");
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
      aria-pressed={isSelected}
      aria-label={rowLabel}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500/70 ${
        isSelected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
          : cardSurfaceClass(candidate.matchScore, isInReviewList)
      }`}
      onClick={onOpenInsights}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenInsights();
        }
      }}
    >
      {isSelected ? <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-primary" /> : null}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
        <span className="flex h-8 w-5 items-center justify-center" onClick={stopRowClick} onKeyDown={stopRowClick}>
          <Checkbox
            className="h-5 w-5"
            checked={isInReviewList}
            onCheckedChange={() => onToggleReviewList(candidate._id)}
            aria-label={t("selectCandidate", { name: candidateDisplayName })}
          />
        </span>
        <Avatar className="h-10 w-10 ring-0">
          {candidate.userId?.avatar ? (
            <AvatarImage src={candidate.userId.avatar} alt={candidateDisplayName} />
          ) : null}
          <AvatarFallback
            className={`text-sm font-semibold ${isInReviewList ? "bg-status-applied-bg text-status-applied" : "bg-secondary/75 text-foreground"}`}
          >
            {(candidateDisplayName[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground sm:text-[15px]">{candidateDisplayName}</h2>
            {rank ? (
              <span className="hidden items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground lg:inline-flex">
                <Trophy className="h-3 w-3 text-amber-500" />
                #{rank}
              </span>
            ) : null}
            {isInReviewList ? (
              <span className="hidden rounded-full border border-border bg-status-applied-bg px-2 py-0.5 text-[10px] font-semibold text-status-applied lg:inline-flex">
                {t("savedLabel")}
              </span>
            ) : null}
            <span className={`ms-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${availabilityTone(candidate.availabilityStatus)}`}>
              {candidate.availabilityStatus === "immediately" ? <Zap className="h-3 w-3" /> : null}
              {availabilityLabel}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">{currentRole ?? t("roleNotSpecified")}</p>
          <p className="truncate text-xs text-muted-foreground/90">{primaryMeta || t("locationExpNotSpecified")}</p>
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
            {/* The trailing "+N more" / skill-gap chips keep shrink-0 individually.
                A blanket [&>*]:shrink-0 here outranked the skills span's own
                `shrink` (arbitrary-variant specificity), so long skill names
                pushed the row past the card and were clipped on phones. */}
            <span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
            {/* 3rd tag hides on phones and folds into the mobile "+more" count —
                showing all 3 there wrapped the last tag onto its own orphan line. */}
            {visibleSkills.map((skill, skillIndex) => {
              const isRequired = requiredSkills.some((requiredSkill) => normalizeText(requiredSkill) === normalizeText(skill));

              return (
                <span
                  key={skill}
                  className={`inline-flex min-w-0 max-w-full items-center rounded-full px-2 py-0.5 font-medium ${skillIndex === 2 ? "hidden sm:inline-flex" : ""} ${isRequired ? "bg-status-applied-bg text-status-applied" : "bg-secondary/75 text-muted-foreground"}`}
                >
                  <span className="truncate">{skill}</span>
                </span>
              );
            })}
            </span>
            {overflowSkillCount > 0 ? <span className="hidden shrink-0 sm:inline">+{overflowSkillCount} {t("moreSuffix")}</span> : null}
            {visibleSkills.length >= 3 ? (
              <span className="shrink-0 sm:hidden">+{overflowSkillCount + 1} {t("moreSuffix")}</span>
            ) : overflowSkillCount > 0 ? (
              <span className="shrink-0 sm:hidden">+{overflowSkillCount} {t("moreSuffix")}</span>
            ) : null}
            {selectedJobData && matchedSkills.length === 0 && missingSkills.length > 0 ? (
              <span className="shrink-0 text-status-shortlisted">{missingSkills.length === 1 ? t("skillGap", { count: missingSkills.length }) : t("skillGaps", { count: missingSkills.length })}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5" onClick={stopRowClick} onKeyDown={stopRowClick}>
          {hasAnyScore ? (
            <ScoreRing
              value={candidate.matchScore}
              size={44}
              strokeWidth={5}
              bandLabel={matchBandLabel(candidate.matchScore, tMatch)}
            />
          ) : null}
          <Button
            size="sm"
            variant={isInReviewList ? "default" : "outline"}
            aria-label={isInReviewList ? t("savedForReview") : t("saveForReview")}
            className={isInReviewList ? "h-8 w-8 rounded-lg bg-primary p-0 text-primary-foreground hover:bg-primary/90" : "h-8 w-8 rounded-lg border-border bg-background/80 p-0"}
            onClick={(event) => {
              stopRowClick(event);
              onToggleReviewList(candidate._id);
            }}
          >
            <Star className={`h-3.5 w-3.5 ${isInReviewList ? "fill-current" : ""}`} />
          </Button>
          {hasSecondaryActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("moreActions", { name: candidateDisplayName })}
                  onClick={stopRowClick}
                  className="h-8 w-8 rounded-lg border-border bg-background/80 p-0 text-foreground/85"
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
                {onSaveToPool ? (
                  <DropdownMenuItem className="rounded-xl text-sm" onClick={() => onSaveToPool(candidate)}>
                    <Layers className="mr-2 h-4 w-4" />
                    {tp("saveToPool")}
                  </DropdownMenuItem>
                ) : null}
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
  const hasInsights = Boolean(candidate.matchSummary || candidate.matchBreakdown);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-h-[88vh] max-w-5xl overflow-hidden rounded-3xl border-border bg-background p-0 shadow-[0_40px_120px_-48px_rgba(15,23,42,0.5)]">
        <div className="max-h-[88vh] overflow-y-auto">
          <div className="relative border-b border-border bg-muted/20 px-6 py-6 sm:px-8">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute end-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-muted"
              aria-label={t("a11yClose")}
            >
              <X className="h-4 w-4" />
            </button>
            <DialogHeader className="gap-3 text-left">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">{getCandidateDisplayName(candidate)}</DialogTitle>
                    {isInReviewList ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-status-applied/20 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-status-applied">
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
                <div className="flex flex-wrap gap-2 lg:justify-end lg:pe-10">
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
            <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
              <div className="workspace-glass-panel rounded-2xl p-3 sm:p-4">
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
              <div className="workspace-glass-panel rounded-2xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("profileQuality")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{candidate.profileCompleteness != null ? t("percentComplete", { percent: candidate.profileCompleteness }) : t("awaitingSignals")}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{selectedJobData ? t("matchedSkills") : t("keySkills")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedJobData ? matchedSkills.length : (candidate.skills?.length ?? 0)}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("missingSignals")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedJobData ? missingSkills.length : "—"}</p>
              </div>
            </div>

            <div className={hasInsights ? "grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]" : "grid gap-4"}>
              {hasInsights ? (
                <div className="space-y-4">
                  {candidate.matchSummary ? (
                    <div className="workspace-glass-panel rounded-3xl p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("aiSummary")}</p>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{candidate.matchSummary}</p>
                    </div>
                  ) : null}

                  {candidate.matchBreakdown ? (
                    <div className="workspace-glass-panel rounded-3xl p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-status-applied" />
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
              ) : null}

              <div className="space-y-4">
                <div className="rounded-3xl border border-border bg-card p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("keySkills")}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(candidate.skills ?? []).map((skill) => {
                      const isRequired = matchedSkills.some((matchedSkill) => normalizeText(matchedSkill) === normalizeText(skill));

                      return (
                        <span
                          key={skill}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${isRequired ? "border border-status-applied/20 bg-status-applied-bg text-status-applied" : "border border-border bg-secondary/75 text-muted-foreground"}`}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {candidate.strengths?.length ? (
                  <div className="rounded-3xl border border-status-selected/20 bg-status-selected-bg p-5">
                    <p className="text-sm font-semibold text-status-selected">{t("strengths")}</p>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
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
                  <div className="rounded-3xl border border-border bg-card p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("roleContext")}</p>
                    {selectedJobData ? (
                      <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                        <div>
                          <p className="font-semibold text-foreground">{selectedJobData.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedJobData.location?.isRemote
                              ? t("remoteRole")
                              : [selectedJobData.location?.city, selectedJobData.location?.country].filter(Boolean).join(", ") || t("locationNotSpecified")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("matchedRequirements")}</p>
                          <p className="mt-1">{matchedSkills.length > 0 ? matchedSkills.join(", ") : t("noRequirementsMatched")}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">{t("chooseJobBenchmark")}</p>
                    )}
                    {candidate.gaps?.length ? (
                      <div className="mt-4 border-t border-border pt-4">
                        <p className="text-sm font-semibold text-status-rejected">{t("gaps")}</p>
                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
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

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
              <Button
                size="sm"
                variant={isInReviewList ? "default" : "outline"}
                className={isInReviewList ? "h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" : "h-10 rounded-xl border-border bg-card px-4 text-sm"}
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
  shortlist: "border-status-selected/20 bg-status-selected-bg text-status-selected",
  consider: "border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted",
  pass: "border-status-rejected/20 bg-status-rejected-bg text-rose-700",
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
    <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-status-applied" />
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

      {/* This panel produces shortlist / consider / pass recommendations, so it
          is the surface where an AI estimate is most likely to be mistaken for
          a decision. Say plainly that it is not one. */}
      <CandidateDataNotice variant="aiScore" />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="workspace-glass-panel rounded-2xl p-3 text-center">
          <p className="text-2xl font-semibold text-status-selected">{shortlistCount}</p>
          <p className="text-xs font-medium text-muted-foreground">{t("shortlist")}</p>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-3 text-center">
          <p className="text-2xl font-semibold text-status-shortlisted">{considerCount}</p>
          <p className="text-xs font-medium text-muted-foreground">{t("consider")}</p>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-3 text-center">
          <p className="text-2xl font-semibold text-status-rejected">{passCount}</p>
          <p className="text-xs font-medium text-muted-foreground">{t("pass")}</p>
        </div>
      </div>

      <div className="space-y-2">
        {results.map((candidate, idx) => {
          const isExpanded = expandedId === candidate.id;
          return (
            <div
              key={candidate.id}
              className={`overflow-hidden rounded-2xl border transition-colors ${RECOMMENDATION_STYLES[candidate.recommendation] ?? "border-border bg-background"}`}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpandedId(isExpanded ? null : candidate.id)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold">
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
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-status-selected" />
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
  const tp = useTranslations("talentPool");

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

  const searchParams = useSearchParams();

  const [selectedJob, setSelectedJob] = useState("");
  const [pageState, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const page = pageState;
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
  const [saveToPoolCandidate, setSaveToPoolCandidate] = useState<Candidate | null>(null);
  const [bulkPoolOpen, setBulkPoolOpen] = useState(false);
  const [reviewListIds, setReviewListIds] = useState<Set<string>>(new Set());
  const [matchFeedback, setMatchFeedback] = useState<MatchFeedback | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [screeningResults, setScreeningResults] = useState<{
    candidates: ScreenedCandidate[];
    jobTitle: string;
    totalReviewed: number;
  } | null>(null);
  // 896px ≈ Tailwind container @4xl: enough room for the detail column beside the list.
  const [layoutRef, isWide] = useContainerWide(896);
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
    { header: t("exportName"), key: "fullName", formatter: (v, r) => String(v ?? (r as Record<string, any>).userId?.name ?? t("unknownCandidate")) },
    { header: t("exportLocation"), key: "currentLocation", formatter: (v) => String(v ?? "—") },
    { header: t("exportExperience"), key: "totalExperienceYears", formatter: (v) => v != null ? String(v) : "—" },
    { header: t("exportSkills"), key: "skills", formatter: (v) => Array.isArray(v) ? v.slice(0, 5).join(", ") : "—" },
    { header: t("exportAiMatch"), key: "matchScore", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: t("exportAvailability"), key: "availabilityStatus", formatter: (v) => String(v ?? "—") },
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
  const visibleHighMatchCount = structuredCandidates.filter((candidate) => (candidate.matchScore ?? 0) >= AI_MATCH_HIGH_THRESHOLD).length;
  const readyNowCount = structuredCandidates.filter((candidate) => candidate.availabilityStatus === "immediately").length;
  const scoredCount = structuredCandidates.filter((candidate) => candidate.matchScore != null).length;
  const reviewCount = reviewListIds.size;
  const allVisibleSelected = filteredCandidates.length > 0 && filteredCandidates.every((candidate) => reviewListIds.has(candidate._id));
  const someVisibleSelected = filteredCandidates.some((candidate) => reviewListIds.has(candidate._id));
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

  // Filter panel is collapsible from the hero; force it open while matching or when there is feedback to show.
  const filtersExpanded = showFilters || Boolean(matchProgress) || Boolean(matchFeedback);

  function openCandidateCv(candidate: Candidate) {
    if (!candidate.cv?.originalUrl) {
      toast.error(t("cvNotAvailable"));
      return;
    }

    // Narrow layout renders insights as a Dialog — close it so the CV viewer isn't stacked behind.
    // Wide layout keeps it as an inline side panel, so leave it open; closing the CV should return to it.
    if (!isWide) {
      setDetailCandidateId(null);
    }

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

  // Reset page when filters change (skip the initial mount so a page restored from the URL survives)
  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const message = t("screeningFailed");
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

  const toggleSelectAllVisible = () => {
    setReviewListIds((prev) => {
      const next = new Set(prev);
      const allSelected = filteredCandidates.length > 0 && filteredCandidates.every((candidate) => next.has(candidate._id));
      if (allSelected) {
        filteredCandidates.forEach((candidate) => next.delete(candidate._id));
      } else {
        filteredCandidates.forEach((candidate) => next.add(candidate._id));
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
      toast.error(t("inviteFailed"));
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
    <div className="page-container">
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
        />
      )}

      <CandidateInsightsDialog
        candidate={detailCandidate}
        open={!isWide && Boolean(detailCandidate)}
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

      <SaveToPoolDialog
        candidateId={saveToPoolCandidate?._id ?? null}
        candidateName={saveToPoolCandidate ? getCandidateDisplayName(saveToPoolCandidate) : undefined}
        open={Boolean(saveToPoolCandidate)}
        onOpenChange={(open) => {
          if (!open) setSaveToPoolCandidate(null);
        }}
      />

      <SaveToPoolDialog
        candidateId={null}
        candidateIds={Array.from(reviewListIds)}
        open={bulkPoolOpen}
        onOpenChange={setBulkPoolOpen}
      />

      <DashboardPageHeader
        icon={Users}
        eyebrow={selectedJobData ? t("benchmark", { title: selectedJobData.title }) : t("talentPoolView")}
        title={t("heroTitle")}
        description={isRefreshingCandidates ? t("refreshing") : undefined}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowFilters((current) => {
                  const next = !current;
                  if (!next) setMatchFeedback(null);
                  return next;
                });
              }}
              aria-expanded={filtersExpanded}
              className="h-9 rounded-xl border-border bg-background/80 px-4 text-sm font-semibold"
            >
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              {t("filters")}
              {activeFilterChips.length > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {activeFilterChips.length}
                </span>
              ) : null}
            </Button>
            <Button
              onClick={runAIMatch}
              disabled={!selectedJob || !!matchProgress || structuredCandidates.length === 0}
              className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {matchProgress ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
              {matchProgress ? `${t("scoringProgress")} ${matchProgress.done}/${matchProgress.total}` : t("runAiMatch")}
            </Button>
            {/* Screening only means something once candidates carry a score, so
                the button stays out of the header until there is something to screen. */}
            {selectedJob && scoredCount > 0 ? (
            <Button
              onClick={runAIScreening}
              disabled={screenMutation.isPending}
              variant="outline"
              className="h-9 rounded-xl border-border bg-background/80 px-4 text-sm font-semibold"
            >
              {screenMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
              {screenMutation.isPending ? t("screeningInProgress") : t("screenWithAi")}
            </Button>
            ) : null}
          </>
        }
        metrics={[
          { label: t("statCandidates"), value: total, icon: Users },
          { label: t("statScored"), value: scoredCount, icon: BarChart3 },
          { label: t("statHighMatch"), value: visibleHighMatchCount, icon: Trophy },
          { label: t("statAvailable"), value: readyNowCount, icon: CheckCircle2 },
        ]}
      />

      {/* Privacy information at the point personal data is first shown, not
          only behind a footer link. */}
      <CandidateDataNotice variant="candidateList" />

      {screeningResults && (
        <AIScreeningResultsPanel
          results={screeningResults.candidates}
          jobTitle={screeningResults.jobTitle}
          totalReviewed={screeningResults.totalReviewed}
          onClose={() => setScreeningResults(null)}
        />
      )}

      {hasLoadError && (
        <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-4 shadow-[0_16px_40px_-36px_rgba(220,38,38,0.45)]">
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
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-900 shadow-[0_16px_40px_-36px_rgba(245,158,11,0.45)]">
            <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-shortlisted" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("noPublishedJobs")}</p>
              <p className="text-sm text-amber-800/90">{t("publishJobFirst")}</p>
          </div>
            </div>
        </div>
      )}

      {/* Collapsible filter panel — toggled from the hero, full width for breathing room */}
      {filtersExpanded ? (
          <section className="workspace-panel-surface rounded-3xl backdrop-blur panel-body">
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

          <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
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
                placeholder={t("noJobSelected")}
              />
            </div>

            <div>
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

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
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
                  <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-status-applied">
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
              <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-800">{aiSummary}</div>
            ) : null}

            {hasAnyScore ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["all", "high", "good", "low", "unscored"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setScoreFilter(tab)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${scoreFilter === tab ? "border-slate-950 bg-slate-950 text-white" : "border-border bg-background/80 text-muted-foreground hover:border-border hover:bg-background"}`}
                  >
                    {SCORE_FILTER_LABELS[tab]}
                    <span className="ml-1.5 opacity-70">({scoreCounts[tab]})</span>
                  </button>
                ))}
              </div>
            ) : null}

            {showAdvancedFilters ? (
              <div className="mt-3 space-y-3 rounded-3xl border border-border bg-background/60 p-3">
                <div className="grid gap-2">
                  <Input
                    value={skillsFilter}
                    onChange={(event) => setSkillsFilter(event.target.value)}
                    placeholder="Skills, comma separated"
                    className="h-10 rounded-xl border-border bg-background/80 text-sm shadow-none"
                  />
                  <Button
                    size="sm"
                    variant={savedOnly ? "default" : "outline"}
                    className={savedOnly ? "h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" : "h-10 rounded-xl border-border bg-background/80 px-4 text-sm"}
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
                      className="rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-sky-500/20 hover:text-status-applied"
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
                    ? "border-status-selected/20 bg-status-selected-bg text-emerald-900"
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
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Scoring candidate {matchProgress.done} of {matchProgress.total} on the current page...</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* List + sticky detail */}
      <div ref={layoutRef} className="@container/cands">
      <div className="grid gap-4 @4xl/cands:grid-cols-[minmax(340px,380px)_minmax(0,1fr)]">
        {/* Center: candidate list */}
        <div className="min-w-0 sticky top-4 flex h-[calc(100vh-1.5rem)] flex-col gap-3">
      {/* Toolbar — Select all (left) + bulk actions + Export (right) on one horizontal section */}
      <TableToolbar
        className="flex-wrap rounded-2xl border border-border bg-card px-3 py-1.5 sm:px-4 sm:py-2.5"
        left={
          !loading && filteredCandidates.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAllVisible}
                aria-label={tp("selectAllOnPage")}
              />
              {reviewCount > 0 ? (
                <span className="font-medium text-foreground">{tp("selectedCount", { count: reviewCount })}</span>
              ) : (
                <span className="text-muted-foreground">{tp("selectAllOnPage")}</span>
              )}
            </label>
          ) : null
        }
        right={
          reviewCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => setBulkPoolOpen(true)}
              >
                <Layers className="mr-2 h-4 w-4" />
                {tp("saveSelectedToPool", { count: reviewCount })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 rounded-xl px-3 text-sm text-muted-foreground hover:bg-background/80"
                onClick={() => setReviewListIds(new Set())}
              >
                {tp("clearSelection")}
              </Button>
            </div>
          ) : null
        }
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto pe-1">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="workspace-panel-surface h-[88px] animate-pulse rounded-3xl" />
          ))}
        </div>
      ) : filteredCandidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("noCandidatesMatch")}
          description={hasSearchRefinements ? t("adjustSearchHint") : t("noProfilesYet")}
        />
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
                isSelected={detailCandidateId === candidate._id}
                onOpenCv={openCandidateCv}
                onStartMessage={startDM}
                onOpenProfile={(candidateId) => router.push(`/${locale}/employer/candidates/${candidateId}`)}
                onToggleReviewList={toggleReviewList}
                onInvite={inviteToApply}
                onSaveToPool={setSaveToPoolCandidate}
                onOpenInsights={() => setDetailCandidateId(candidate._id)}
              />
            );
          })}
        </div>
      )}
      </div>
        </div>

        {/* Right: sticky detail panel (only when the container is wide enough) */}
        <aside className="hidden @4xl/cands:block">
          <div className="sticky top-4 h-[calc(100vh-1.5rem)]">
            <CandidateDetailPanel
              candidate={isWide ? detailCandidate : null}
              selectedJobData={selectedJobData}
              isInReviewList={detailCandidate ? reviewListIds.has(detailCandidate._id) : false}
              onOpenCv={openCandidateCv}
              onStartMessage={startDM}
              onOpenProfile={(candidateId) => router.push(`/${locale}/employer/candidates/${candidateId}`)}
              onToggleReviewList={toggleReviewList}
            />
          </div>
        </aside>
      </div>

      {/* Pagination — full-width footer under the whole list + detail card */}
      <div className="mt-4 border-t border-border pt-4">
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
        />
      </div>
      </div>
    </div>
  );
}
