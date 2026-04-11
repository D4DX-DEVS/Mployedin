"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Sparkles, Loader2, Star, Users, MapPin, Briefcase, Eye,
  MessageSquare, Zap, FileText, CheckCircle, ChevronDown, ChevronRight,
  BarChart3, Target, CheckCheck, Trophy, Clock,
} from "lucide-react";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { useCandidates, usePublishedJobs, useStartConversation, useAiMatch } from "@/hooks/useCandidates";
import type { Candidate, CandidateJob } from "@/hooks/useCandidates";

// ── Score helpers ────────────────────────────────────────────────────────────
const scoreBadgeClass = (score?: number) => {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 80) return "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400";
  if (score >= 60) return "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-400";
  return "bg-red-100 text-red-600 border border-red-200 dark:bg-red-900/40 dark:text-red-400";
};

const rowHighlight = (score?: number, shortlisted?: boolean) => {
  if (shortlisted) return "bg-emerald-50/80 dark:bg-emerald-950/30";
  if (score != null && score >= 80) return "bg-emerald-50/40 dark:bg-emerald-950/10";
  return "";
};

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

type ScoreFilter = "all" | "high" | "good" | "low" | "unscored";

export default function EmployerCandidatesPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedJob, setSelectedJob] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());

  // ── Hooks ────────────────────────────────────────────────────────────────
  const { data: jobs = [] } = usePublishedJobs();
  const { data: candidatesData, isLoading: loading } = useCandidates({ page, limit, search: debouncedSearch });
  const startDmMutation = useStartConversation();
  const aiMatchMutation = useAiMatch();

  const candidates = localCandidates ?? candidatesData?.candidates ?? [];
  const total = candidatesData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedJobData: CandidateJob | undefined = jobs.find((j) => j._id === selectedJob);
  const hasAnyScore = candidates.some((c) => c.matchScore != null);

  // Reset local overrides when server data changes
  useEffect(() => { setLocalCandidates(null); setShortlisted(new Set()); }, [candidatesData]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // ── Score filter ─────────────────────────────────────────────────────────
  const filteredCandidates = candidates.filter((c) => {
    const s = c.matchScore;
    if (scoreFilter === "high") return s != null && s >= 80;
    if (scoreFilter === "good") return s != null && s >= 60 && s < 80;
    if (scoreFilter === "low") return s != null && s < 60;
    if (scoreFilter === "unscored") return s == null;
    return true;
  });

  // ── AI Match — sequential with progress ──────────────────────────────────
  const runAIMatch = async () => {
    if (!selectedJob || candidates.length === 0) return;
    const toScore = candidates.slice(0, 20); // max 20 at once
    setMatchProgress({ done: 0, total: toScore.length });

    const results: Candidate[] = [...(candidatesData?.candidates ?? [])];
    let done = 0;

    for (const c of toScore) {
      // Use userId._id if available (API expects User._id or JobSeeker._id — both handled now)
      const jobSeekerId = c.userId?._id || c._id;
      try {
        const data = await aiMatchMutation.mutateAsync({ jobId: selectedJob, jobSeekerId });
        const idx = results.findIndex((r) => r._id === c._id);
        if (idx !== -1) {
          results[idx] = {
            ...results[idx],
            matchScore: data.score,
            matchBreakdown: data.breakdown,
            matchSummary: data.summary,
            strengths: data.strengths,
            gaps: data.gaps,
          };
        }
      } catch { /* skip failed */ }
      done++;
      setMatchProgress({ done, total: toScore.length });
    }

    setLocalCandidates([...results].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)));
    setMatchProgress(null);
    setScoreFilter("all");
  };

  // ── Auto-shortlist: top candidates ≥80%, or top 5 fallback ───────────────
  const autoShortlist = () => {
    const scored = candidates.filter((c) => c.matchScore != null).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    let picks = scored.filter((c) => (c.matchScore ?? 0) >= 80);
    if (!picks.length) picks = scored.slice(0, 5);
    setShortlisted((prev) => {
      const next = new Set(prev);
      picks.forEach((c) => next.add(c._id));
      return next;
    });
  };

  const toggleShortlist = (id: string) =>
    setShortlisted((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const startDM = async (recipientUserId: string) => {
    try {
      const data = await startDmMutation.mutateAsync(recipientUserId);
      router.push(`/${locale}/employer/messages?conv=${data.conversation._id}`);
    } catch { /* ignore */ }
  };

  const availabilityLabel = (s?: string) => {
    switch (s) {
      case "immediately": return "Available now";
      case "within_month": return "< 1 month";
      case "within_3_months": return "< 3 months";
      case "not_available": return "Not available";
      default: return "—";
    }
  };

  const currentRole = (c: Candidate) =>
    c.experience?.find((e) => e.isCurrent)?.jobTitle ?? null;

  const matchRank = (c: Candidate) => {
    if (!hasAnyScore || c.matchScore == null) return null;
    const ranked = [...candidates].filter((x) => x.matchScore != null).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    return ranked.findIndex((x) => x._id === c._id) + 1;
  };

  // ── Score filter tab counts ───────────────────────────────────────────────
  const tabCounts = {
    all: candidates.length,
    high: candidates.filter((c) => (c.matchScore ?? -1) >= 80).length,
    good: candidates.filter((c) => (c.matchScore ?? -1) >= 60 && (c.matchScore ?? -1) < 80).length,
    low: candidates.filter((c) => c.matchScore != null && c.matchScore < 60).length,
    unscored: candidates.filter((c) => c.matchScore == null).length,
  };

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
        />
      )}

      <PageHeader
        title="ATS Candidate Matching"
        description={`${total} candidates in database`}
        actions={
          shortlisted.size > 0 ? (
            <Badge className="text-sm px-3 py-1 bg-emerald-600 text-white">
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              {shortlisted.size} shortlisted
            </Badge>
          ) : undefined
        }
      />

      {/* ── Step 1: Job Selector ─────────────────────────────────────────────── */}
      <div className="card-base p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Step 1 — Select Job to Match Against</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={selectedJob || "none"} onValueChange={(v) => {
            setSelectedJob(v === "none" ? "" : v);
            setLocalCandidates(null);
            setScoreFilter("all");
          }}>
            <SelectTrigger className="flex-1 h-10">
              <SelectValue placeholder="Choose a job posting…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No job selected</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j._id} value={j._id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or skill…" className="pl-9 pr-4 h-10" />
          </div>
        </div>

        {/* Job info pill row */}
        {selectedJobData && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground font-medium">Requirements:</span>
            {selectedJobData.requirements?.skills?.slice(0, 8).map((s) => (
              <span key={s} className="text-[11px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{s}</span>
            ))}
            {(selectedJobData.requirements?.skills?.length ?? 0) > 8 && (
              <span className="text-[11px] text-muted-foreground">+{selectedJobData.requirements!.skills!.length - 8} more</span>
            )}
            {selectedJobData.requirements?.experienceMin != null && (
              <span className="text-[11px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                <Briefcase className="w-2.5 h-2.5 inline mr-1" />
                {selectedJobData.requirements.experienceMin}–{selectedJobData.requirements.experienceMax ?? "10+"}y exp
              </span>
            )}
            {selectedJobData.location?.isRemote && (
              <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Remote</span>
            )}
          </div>
        )}

        {/* Step 2: Run match */}
        <div className="flex items-center gap-3 pt-1 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Step 2 — Run AI Scoring</span>
          </div>
          <Button
            onClick={runAIMatch}
            disabled={!selectedJob || !!matchProgress || candidates.length === 0}
            size="sm"
            className="h-9"
          >
            {matchProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" /> : <Sparkles className="h-3.5 w-3.5 me-1.5" />}
            {matchProgress ? `Scoring ${matchProgress.done}/${matchProgress.total}…` : "Run AI Match"}
          </Button>
          {hasAnyScore && (
            <Button
              size="sm"
              variant="default"
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={autoShortlist}
            >
              <CheckCheck className="h-3.5 w-3.5 me-1.5" />
              Auto Shortlist Top Candidates
            </Button>
          )}
          {hasAnyScore && shortlisted.size > 0 && (
            <span className="text-xs text-emerald-600 font-medium">{shortlisted.size} candidate{shortlisted.size !== 1 ? "s" : ""} shortlisted</span>
          )}
        </div>

        {/* Progress bar */}
        {matchProgress && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Scoring candidate {matchProgress.done} of {matchProgress.total}…</p>
          </div>
        )}
      </div>

      {/* ── Score filter tabs ─────────────────────────────────────────────────── */}
      {hasAnyScore && (
        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: "all", label: "All", color: "" },
            { key: "high", label: "🟢 High Match (≥80%)", color: "data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-emerald-600" },
            { key: "good", label: "🟡 Good (60–79%)", color: "data-[active=true]:bg-amber-500 data-[active=true]:text-white data-[active=true]:border-amber-500" },
            { key: "low", label: "🔴 Low (<60%)", color: "data-[active=true]:bg-red-500 data-[active=true]:text-white data-[active=true]:border-red-500" },
            { key: "unscored", label: "⚪ Unscored", color: "" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              data-active={scoreFilter === tab.key}
              onClick={() => setScoreFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border border-border transition-colors
                ${scoreFilter === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}
                ${tab.color}`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-70">({tabCounts[tab.key]})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Candidate Table ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card-base h-14 animate-pulse" />)}
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="card-base flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">No candidates found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {scoreFilter !== "all" ? "Try a different score filter" : search ? "Try a different search term" : "No job seeker profiles exist yet"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {hasAnyScore && <TableHead className="w-12 text-center">#</TableHead>}
                <TableHead>Candidate</TableHead>
                <TableHead className="hidden md:table-cell">Current Role</TableHead>
                <TableHead className="hidden lg:table-cell">Skills</TableHead>
                <TableHead className="hidden md:table-cell">Availability</TableHead>
                {hasAnyScore && <TableHead className="text-center w-28">AI Match</TableHead>}
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.map((c) => {
                const rank = matchRank(c);
                const isExpanded = expandedId === c._id;
                const isShortlisted = shortlisted.has(c._id);
                const role = currentRole(c);

                return (
                  <>
                    <TableRow
                      key={c._id}
                      className={`cursor-pointer transition-colors ${rowHighlight(c.matchScore, isShortlisted)}`}
                      onClick={() => setExpandedId(isExpanded ? null : c._id)}
                    >
                      {hasAnyScore && (
                        <TableCell className="text-center w-12">
                          {rank && rank <= 3
                            ? <span className="text-lg">{RANK_MEDAL[rank]}</span>
                            : rank
                            ? <span className="text-xs text-muted-foreground font-medium">#{rank}</span>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold
                            ${isShortlisted ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}>
                            {(c.userId?.name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{c.userId?.name ?? "Unknown"}</p>
                              {isShortlisted && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium border border-emerald-200">
                                  <CheckCircle className="w-2.5 h-2.5" /> Shortlisted
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{c.userId?.email}</p>
                            {c.currentLocation && (
                              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                <MapPin className="w-2.5 h-2.5" /> {c.currentLocation}
                              </p>
                            )}
                          </div>
                          {(c.strengths?.length || c.gaps?.length) && (
                            <span className="ml-auto shrink-0 text-muted-foreground">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div>
                          <p className="text-sm">{role ?? <span className="text-muted-foreground">—</span>}</p>
                          {c.totalExperienceYears != null && (
                            <p className="text-[11px] text-muted-foreground">{c.totalExperienceYears}+ yrs exp</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {c.skills?.slice(0, 4).map((s) => {
                            const isRequired = selectedJobData?.requirements?.skills?.some(
                              (req) => req.toLowerCase() === s.toLowerCase()
                            );
                            return (
                              <span
                                key={s}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  isRequired
                                    ? "bg-primary/15 text-primary border border-primary/20"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {s}
                              </span>
                            );
                          })}
                          {(c.skills?.length ?? 0) > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{c.skills!.length - 4}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge
                          variant={c.availabilityStatus === "immediately" ? "default" : c.availabilityStatus === "not_available" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {c.availabilityStatus === "immediately" && <Zap className="w-2.5 h-2.5 mr-1" />}
                          {availabilityLabel(c.availabilityStatus)}
                        </Badge>
                      </TableCell>
                      {hasAnyScore && (
                        <TableCell className="text-center w-28">
                          {c.matchScore != null ? (
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold ${scoreBadgeClass(c.matchScore)}`}>
                              {c.matchScore}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right w-40">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {c.cv?.originalUrl && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View CV"
                              onClick={() => setViewingCv({
                                url: c.cv!.originalUrl!,
                                name: c.userId?.name ?? "Candidate",
                                candidate: { role: role ?? undefined, skills: c.skills, location: c.currentLocation },
                                aiMatchScore: c.matchScore,
                                matchBreakdown: c.matchBreakdown,
                                strengths: c.strengths,
                                gaps: c.gaps,
                              })}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {c.userId?._id && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary" title="Message"
                              onClick={() => startDM(c.userId!._id)}>
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Profile"
                            onClick={() => router.push(`/${locale}/employer/candidates/${c._id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant={isShortlisted ? "default" : "outline"}
                            className={`h-7 px-2 text-[11px] gap-1 ${isShortlisted ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "hover:border-emerald-500 hover:text-emerald-700"}`}
                            onClick={() => toggleShortlist(c._id)}
                          >
                            <Star className={`h-3 w-3 ${isShortlisted ? "fill-current" : ""}`} />
                            {isShortlisted ? "✓" : "Shortlist"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* ── Expanded: Match Breakdown + Strengths/Gaps ── */}
                    {isExpanded && (c.matchBreakdown || c.strengths?.length || c.gaps?.length || c.matchSummary) && (
                      <TableRow key={`${c._id}-expand`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={hasAnyScore ? 7 : 6} className="py-3 px-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Breakdown bars */}
                            {c.matchBreakdown && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-xs font-semibold">Score Breakdown</span>
                                </div>
                                {(Object.entries(c.matchBreakdown) as [string, number][]).map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-2">
                                    <span className="text-[11px] capitalize text-muted-foreground w-20">{k}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className={`h-full rounded-full ${v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                                        style={{ width: `${v}%` }} />
                                    </div>
                                    <span className="text-[11px] font-medium w-7 text-right">{v}%</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Strengths */}
                            {c.strengths && c.strengths.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-emerald-600 mb-1.5">✓ Strengths</p>
                                <ul className="space-y-1">
                                  {c.strengths.map((s, i) => (
                                    <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                                      <span className="text-emerald-500 shrink-0 mt-0.5">•</span> {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* Gaps + Summary */}
                            <div className="space-y-3">
                              {c.gaps && c.gaps.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-red-500 mb-1.5">✗ Gaps</p>
                                  <ul className="space-y-1">
                                    {c.gaps.map((g, i) => (
                                      <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                                        <span className="text-red-400 shrink-0 mt-0.5">•</span> {g}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {c.matchSummary && (
                                <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2">{c.matchSummary}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
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

