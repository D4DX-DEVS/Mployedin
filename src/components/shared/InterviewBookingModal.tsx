"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Video,
  MapPin,
  Phone,
  X,
  AlertCircle,
  Search,
  User,
  ArrowLeft,
  Briefcase,
} from "lucide-react";
import type { CalendarEvent, BookingCandidate, BookingPayload, JobOption } from "./MployedinCalendar";

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateLocale(date: Date, locale: string, opts: Intl.DateTimeFormatOptions) {
  return date.toLocaleDateString(locale, opts);
}

/* ================================================================== */
/*  InterviewBookingModal                                              */
/* ================================================================== */

interface InterviewBookingModalProps {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onSubmit: (payload: BookingPayload) => Promise<void>;
  fetchCandidates?: (search: string, filters?: { jobId?: string; scoreMin?: number }) => Promise<BookingCandidate[]>;
  fetchJobs?: () => Promise<JobOption[]>;
  prefilledCandidate?: BookingCandidate;
}

export function InterviewBookingModal({
  date,
  events,
  onClose,
  onSubmit,
  fetchCandidates,
  fetchJobs,
  prefilledCandidate,
}: InterviewBookingModalProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isRtl = locale === "ar";

  // Steps: "candidate" â†’ "details" â†’ "confirmation"
  const initialStep = prefilledCandidate ? "details" : fetchCandidates ? "candidate" : "details";
  const [step, setStep] = useState<"candidate" | "details" | "confirmation">(initialStep);

  // Selected candidates (supports bulk)
  const [selectedCandidates, setSelectedCandidates] = useState<BookingCandidate[]>(
    prefilledCandidate ? [prefilledCandidate] : []
  );

  // Candidate search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<BookingCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Job filter
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<number>(0);

  // Details state
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [type, setType] = useState<"video" | "offline" | "hybrid">("video");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [bookingProgress, setBookingProgress] = useState<{ done: number; total: number } | null>(null);

  const isToday = isSameDay(date, new Date());
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Fetch jobs on mount
  useEffect(() => {
    if (fetchJobs) {
      fetchJobs()
        .then(setJobs)
        .catch(() => {
          setJobs([]);
          setError("Failed to load jobs. Please try again.");
        });
    }
  }, [fetchJobs]);

  // Debounced candidate search with filters
  useEffect(() => {
    if (!fetchCandidates || step !== "candidate") return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const filters: { jobId?: string; scoreMin?: number } = {};
        if (selectedJobId) filters.jobId = selectedJobId;
        if (scoreFilter > 0) filters.scoreMin = scoreFilter;
        const results = await fetchCandidates(searchQuery, filters);
        setCandidates(results);
      } catch {
        setCandidates([]);
      } finally {
        setSearchLoading(false);
        setSearchDone(true);
      }
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, fetchCandidates, step, selectedJobId, scoreFilter]);

  // Generate time slots (30 min intervals)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const totalMin = h * 60 + m;
        if (isToday && totalMin <= currentMinutes + 30) continue;
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return slots;
  }, [isToday, currentMinutes]);

  // Set default time
  useEffect(() => {
    if (timeSlots.length > 0 && !timeSlots.includes(time)) {
      setTime(timeSlots[0]);
    }
  }, [timeSlots, time]);

  // Check for conflicts
  const conflicts = useMemo(() => {
    const reqStart = new Date(date);
    const [h, m] = time.split(":").map(Number);
    reqStart.setHours(h, m, 0, 0);
    const totalSlots = selectedCandidates.length || 1;
    const reqEnd = new Date(reqStart.getTime() + duration * totalSlots * 60000);
    return events.filter((e) => {
      const eStart = new Date(e.scheduledAt);
      const eEnd = new Date(eStart.getTime() + (e.duration ?? 30) * 60000);
      return eStart < reqEnd && eEnd > reqStart;
    });
  }, [date, time, duration, events, selectedCandidates.length]);

  // Toggle candidate selection
  const toggleCandidate = (candidate: BookingCandidate) => {
    setSelectedCandidates((prev) => {
      const exists = prev.find((c) => c.applicationId === candidate.applicationId);
      if (exists) return prev.filter((c) => c.applicationId !== candidate.applicationId);
      return [...prev, candidate];
    });
  };

  // Select all visible candidates
  const toggleSelectAll = () => {
    if (selectedCandidates.length === candidates.length && candidates.length > 0) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates([...candidates]);
    }
  };

  const isAllSelected = candidates.length > 0 && selectedCandidates.length === candidates.length;
  const isSomeSelected = selectedCandidates.length > 0 && selectedCandidates.length < candidates.length;

  const handleGoToDetails = () => {
    if (selectedCandidates.length === 0) {
      setError(t("selectCandidate"));
      return;
    }
    setError("");
    setStep("details");
  };

  const handleGoToConfirmation = () => {
    if (conflicts.length > 0) {
      setError(t("conflictTitle"));
      return;
    }
    setError("");
    setStep("confirmation");
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    setBookingProgress({ done: 0, total: selectedCandidates.length });

    const baseDate = new Date(`${date.toISOString().split("T")[0]}T${time}:00`);
    let successCount = 0;
    const failures: string[] = [];

    for (let i = 0; i < selectedCandidates.length; i++) {
      const candidate = selectedCandidates[i];
      // Stagger time slots for bulk: each subsequent candidate gets +duration offset
      const slotDate = new Date(baseDate.getTime() + i * duration * 60000);
      const slotTime = `${String(slotDate.getHours()).padStart(2, "0")}:${String(slotDate.getMinutes()).padStart(2, "0")}`;

      try {
        await onSubmit({
          applicationId: candidate.applicationId,
          date: date.toISOString().split("T")[0],
          time: slotTime,
          duration,
          type,
          notes: notes.trim() || undefined,
        });
        successCount++;
      } catch (err) {
        failures.push(`${candidate.candidateName}: ${err instanceof Error ? err.message : "Failed"}`);
      }
      setBookingProgress({ done: i + 1, total: selectedCandidates.length });
    }

    if (failures.length > 0 && successCount === 0) {
      setError(failures.join("; "));
      setSubmitting(false);
      setBookingProgress(null);
    } else {
      onClose();
    }
  };

  const selectedTimeLabel = (() => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
  })();

  const endTimeLabel = (() => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    const totalMinutes = selectedCandidates.length > 1
      ? m + duration * selectedCandidates.length
      : m + duration;
    d.setHours(h, totalMinutes);
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
  })();

  const scoreLabel = (score: number) => {
    if (score >= 80) return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15";
    if (score >= 50) return "text-amber-600 dark:text-amber-400 bg-amber-500/15";
    return "text-red-600 dark:text-red-400 bg-red-500/15";
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* â”€â”€ Header â”€â”€ */}
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            {step === "details" && fetchCandidates && !prefilledCandidate && (
              <button onClick={() => setStep("candidate")} className="rounded-lg p-1 hover:bg-muted">
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {step === "confirmation" && (
              <button onClick={() => setStep("details")} className="rounded-lg p-1 hover:bg-muted">
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <h3 className="text-base font-semibold text-foreground">
              {step === "candidate"
                ? t("selectCandidate")
                : step === "details"
                  ? t("interviewDetails")
                  : t("confirmBooking")}
            </h3>
            {selectedCandidates.length > 1 && step === "candidate" && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {t("selectedCount", { count: selectedCandidates.length })}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* â”€â”€ Step 1: Candidate Selection (Table with Filters) â”€â”€ */}
        {step === "candidate" && (
          <div className="flex flex-col min-h-0 flex-1">
            {/* Filters toolbar */}
            <div className="border-b px-5 py-3 space-y-2 shrink-0">
              {/* Search row */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("searchCandidates")}
                    className="w-full rounded-lg border bg-background py-2 ps-9 pe-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                </div>
              </div>
              {/* Filter row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Job filter */}
                {jobs.length > 0 && (
                  <Select
                    value={selectedJobId || "__all__"}
                    onValueChange={(v) => setSelectedJobId(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger
                      aria-label={t("filterByJob")}
                      className="h-8 w-auto min-w-[140px] max-w-[220px] gap-1.5 rounded-lg px-2.5 text-xs"
                    >
                      <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <SelectValue placeholder={t("allJobs")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("allJobs")}</SelectItem>
                      {jobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.title}
                          {job.applicantCount != null ? ` (${job.applicantCount})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {/* Score filter */}
                <Select
                  value={String(scoreFilter)}
                  onValueChange={(v) => setScoreFilter(Number(v))}
                >
                  <SelectTrigger
                    aria-label={t("filterByMatch")}
                    className="h-8 w-auto min-w-[150px] gap-1.5 rounded-lg px-2.5 text-xs"
                  >
                    <SelectValue placeholder={t("anyMatchScore")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("anyMatchScore")}</SelectItem>
                    {[50, 70, 80, 90].map((score) => (
                      <SelectItem key={score} value={String(score)}>
                        {t("matchThreshold", { score })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Result count */}
                {searchDone && !searchLoading && (
                  <span className="text-[11px] text-muted-foreground ms-auto">
                    {t("candidatesCount", { count: candidates.length })}
                  </span>
                )}
              </div>
            </div>

            {/* Candidates table */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {searchLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <span className="text-xs text-muted-foreground">{t("searchCandidates")}...</span>
                </div>
              )}

              {!searchLoading && searchDone && candidates.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <User className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">
                    {searchQuery || selectedJobId ? t("noCandidatesFound") : t("noCandidatesEligible")}
                  </p>
                </div>
              )}

              {!searchLoading && candidates.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b">
                    <tr>
                      <th className="w-10 px-3 py-2.5 text-start">
                        <button
                          onClick={toggleSelectAll}
                          className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            isAllSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : isSomeSelected
                                ? "border-primary bg-primary/20"
                                : "border-border hover:border-primary/50"
                          }`}
                        >
                          {isAllSelected && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          {isSomeSelected && !isAllSelected && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path d="M3 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </th>
                      <th className="px-3 py-2.5 text-start font-medium text-muted-foreground">{t("candidateColumn")}</th>
                      <th className="px-3 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("jobColumn")}</th>
                      <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">{t("matchColumn")}</th>
                      <th className="px-3 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">{t("statusColumn")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {candidates.map((c) => {
                      const isSelected = selectedCandidates.some((s) => s.applicationId === c.applicationId);
                      return (
                        <tr
                          key={c.applicationId}
                          onClick={() => toggleCandidate(c)}
                          className={`cursor-pointer transition-colors hover:bg-muted/40 ${isSelected ? "bg-primary/5" : ""}`}
                        >
                          <td className="px-3 py-2.5">
                            <div
                              className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border"
                              }`}
                            >
                              {isSelected && (
                                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <User className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <span className="font-medium text-foreground truncate max-w-[140px]">
                                {c.candidateName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <span className="truncate max-w-[120px] inline-block text-muted-foreground">
                              {c.jobTitle}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {c.matchScore != null ? (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${scoreLabel(c.matchScore)}`}>
                                {c.matchScore}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">â€”</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <span className="inline-block rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                              {c.status.replace(/_/g, " ")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t px-5 py-3 flex items-center justify-between shrink-0">
              <p className="text-[11px] text-muted-foreground">
                {selectedCandidates.length > 0
                  ? t("backToBackHint", { count: selectedCandidates.length })
                  : t("selectOneOrMore")}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  className="rounded-xl shadow-sm shadow-primary/20"
                  disabled={selectedCandidates.length === 0}
                  onClick={handleGoToDetails}
                >
                  {t("next")} ({selectedCandidates.length})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ Step 2: Interview Details â”€â”€ */}
        {step === "details" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Selected candidates chip(s) */}
            {selectedCandidates.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Candidates ({selectedCandidates.length})
                  </p>
                  {fetchCandidates && !prefilledCandidate && (
                    <button
                      onClick={() => setStep("candidate")}
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      {t("change")}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCandidates.slice(0, 6).map((c) => (
                    <span
                      key={c.applicationId}
                      className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-[10px] font-medium text-foreground"
                    >
                      <User className="h-2.5 w-2.5 text-primary" />
                      {c.candidateName}
                      <button
                        onClick={() => setSelectedCandidates((prev) => prev.filter((s) => s.applicationId !== c.applicationId))}
                        className="ms-0.5 rounded-full hover:bg-destructive/10 p-0.5"
                      >
                        <X className="h-2.5 w-2.5 text-muted-foreground" />
                      </button>
                    </span>
                  ))}
                  {selectedCandidates.length > 6 && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      +{selectedCandidates.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Date display */}
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("date")}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {formatDateLocale(date, locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* Time selection */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("timeLabel")} {selectedCandidates.length > 1 && "(first interview starts at)"}
              </label>
              {timeSlots.length === 0 ? (
                <p className="text-xs text-destructive">{t("noTimeSlots")}</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-[140px] overflow-y-auto rounded-xl border border-border/50 bg-muted/20 p-2">
                  {timeSlots.map((slot) => {
                    const [sh, sm] = slot.split(":").map(Number);
                    const d = new Date();
                    d.setHours(sh, sm);
                    const label = d.toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });
                    const isActive = time === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTime(slot)}
                        className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                            : "bg-background hover:bg-muted text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("duration")} {selectedCandidates.length > 1 && "(per candidate)"}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([15, 30, 45, 60] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      duration === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {t("min", { count: d })}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("type")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["video", "offline", "hybrid"] as const).map((tp) => (
                  <button
                    key={tp}
                    onClick={() => setType(tp)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      type === tp
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {tp === "video" ? (
                      <Video className="h-3 w-3" />
                    ) : tp === "offline" ? (
                      <MapPin className="h-3 w-3" />
                    ) : (
                      <Phone className="h-3 w-3" />
                    )}
                    {tp === "video" ? t("videoCall") : tp === "offline" ? t("inPerson") : t("hybrid")}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("notes")} ({t("optional")})
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={t("notesPlaceholder")}
              />
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("summary")}
              </p>
              <p className="mt-1 text-xs text-foreground">
                {selectedCandidates.length > 1
                  ? `${selectedCandidates.length} interviews Â· `
                  : selectedCandidates[0]
                    ? `${selectedCandidates[0].candidateName} Â· `
                    : ""}
                {selectedTimeLabel} â€“ {endTimeLabel} Â· {t("min", { count: duration })} each Â· {type === "video" ? t("videoCall") : type === "offline" ? t("inPerson") : t("hybrid")}
              </p>
              {selectedCandidates.length > 1 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Interviews scheduled back-to-back: {duration}min per candidate
                </p>
              )}
            </div>

            {/* Conflict warning */}
            {conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-destructive">{t("conflictTitle")}</p>
                  <p className="mt-0.5 text-[10px] text-destructive/70">
                    {t("conflictDesc", { titles: conflicts.map((c) => c.title).join(", ") })}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                className="flex-1 rounded-xl shadow-sm shadow-primary/20"
                disabled={conflicts.length > 0 || timeSlots.length === 0}
                onClick={handleGoToConfirmation}
              >
                {t("reviewConfirm")}
              </Button>
            </div>
          </div>
        )}

        {/* â”€â”€ Step 3: Confirmation â”€â”€ */}
        {step === "confirmation" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Candidate list */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {selectedCandidates.length > 1 ? `${selectedCandidates.length} Interviews` : "Interview"}
              </p>
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {selectedCandidates.map((c, idx) => {
                  const slotDate = new Date(
                    new Date(`${date.toISOString().split("T")[0]}T${time}:00`).getTime() + idx * duration * 60000
                  );
                  const slotLabel = slotDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
                  return (
                    <div key={c.applicationId} className="flex items-center gap-2.5 rounded-lg bg-background/60 p-2">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{c.candidateName}</p>
                        <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                          <Briefcase className="h-2.5 w-2.5" /> {c.jobTitle}
                        </p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="text-[10px] font-medium text-foreground">{slotLabel}</p>
                        <p className="text-[9px] text-muted-foreground">{t("min", { count: duration })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Details summary */}
            <div className="space-y-2.5 rounded-xl bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("date")}</span>
                <span className="text-xs font-semibold text-foreground">
                  {formatDateLocale(date, locale, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("timeLabel")}</span>
                <span className="text-xs font-semibold text-foreground">
                  {selectedTimeLabel} â€“ {endTimeLabel}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("duration")}</span>
                <span className="text-xs font-semibold text-foreground">
                  {selectedCandidates.length > 1
                    ? `${t("min", { count: duration })} Ã— ${selectedCandidates.length} = ${duration * selectedCandidates.length} min total`
                    : t("minutes", { count: duration })}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("type")}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {type === "video" ? <Video className="h-3 w-3 text-sky-500" /> : type === "offline" ? <MapPin className="h-3 w-3 text-emerald-500" /> : <Phone className="h-3 w-3 text-violet-500" />}
                  {type === "video" ? t("videoCall") : type === "offline" ? t("inPerson") : t("hybrid")}
                </span>
              </div>
              {notes && (
                <>
                  <div className="h-px bg-border/50" />
                  <div>
                    <span className="text-xs text-muted-foreground">{t("notes")}</span>
                    <p className="mt-0.5 text-xs text-foreground">{notes}</p>
                  </div>
                </>
              )}
            </div>

            {/* Progress indicator */}
            {bookingProgress && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-primary">
                    Booking interviews...
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {bookingProgress.done}/{bookingProgress.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${(bookingProgress.done / bookingProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setStep("details")}>
                {t("back")}
              </Button>
              <Button
                size="sm"
                className="flex-1 rounded-xl shadow-sm shadow-primary/20"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting
                  ? t("booking")
                  : selectedCandidates.length > 1
                    ? `${t("confirmBook")} (${selectedCandidates.length})`
                    : t("confirmBook")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
