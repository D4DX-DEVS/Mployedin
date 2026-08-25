"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import {
  X, Download, FileText, ZoomIn, ZoomOut, RotateCw,
  MapPin, Briefcase, Star, XCircle, Calendar, Brain,
  CheckCircle2, MoreHorizontal, Maximize2, Minimize2,
  AlertTriangle, Loader2, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAtsCheck, type AtsReport } from "@/hooks/useCandidates";

interface CandidateInfo {
  role?: string;
  experience?: number;
  skills?: string[];
  location?: string;
}

interface MatchBreakdown {
  skills?: number;
  experience?: number;
  location?: number;
  overall?: number;
}

interface ResumeViewerModalProps {
  url: string;
  fileName?: string;
  candidateName?: string;
  onClose: () => void;
  applicationId?: string;
  status?: string;
  candidate?: CandidateInfo;
  aiMatchScore?: number;
  matchBreakdown?: MatchBreakdown;
  strengths?: string[];
  gaps?: string[];
  onStatusChange?: (status: string) => void;
  /** JobSeeker _id — enables the ATS compatibility analysis panel. */
  jobSeekerId?: string;
  /** Job _id — the keyword-match panel only renders when a job is in context. */
  jobId?: string;
}

const STATUS_CONFIG: Record<string, { label: string; pill: string }> = {
  applied:             { label: "Applied",     pill: "bg-blue-100 text-blue-700" },
  shortlisted:         { label: "Shortlisted", pill: "bg-emerald-100 text-emerald-700" },
  interview_scheduled: { label: "Interview",   pill: "bg-purple-100 text-purple-700" },
  offer:               { label: "Offer",       pill: "bg-amber-100 text-amber-700" },
  selected:            { label: "Selected",    pill: "bg-green-100 text-green-700" },
  rejected:            { label: "Rejected",    pill: "bg-red-100 text-red-700" },
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MoreMenu({ url, displayName }: { url: string; displayName: string }) {
  const t = useTranslations("resumeViewerModal");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="iconDense" className="" onClick={() => setOpen((o) => !o)} title={t("more")}>
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && (
        <div className="absolute end-0 top-9 z-10 w-44 rounded-lg border bg-popover shadow-lg py-1 text-sm">
          <a
            href={url}
            download={displayName}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors"
            onClick={() => setOpen(false)}
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            {t("downloadCv")}
          </a>
        </div>
      )}
    </div>
  );
}

function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/**
 * Job keyword-match panel. Only meaningful when a candidate is viewed against a
 * specific job (jobId), so the caller gates on jobId. It reports how many of the
 * job's required skills appear in the CV's extracted text, and warns when the CV
 * can't be text-parsed (so the employer reads the original before deciding).
 * The job-agnostic "readability %" is deliberately not shown — a healthy parse
 * is not information an employer needs; only a failed one is.
 */
function AtsPanel({ jobSeekerId, jobId }: { jobSeekerId: string; jobId: string }) {
  const t = useTranslations("resumeViewerModal");
  const ats = useAtsCheck();
  const [report, setReport] = useState<AtsReport | null>(null);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${jobSeekerId}:${jobId}`;
    if (ranFor.current === key) return;
    ranFor.current = key;
    // Failure is non-fatal here — the employer can still read the CV. ponytail: swallow, no scary red box for a nicety.
    ats.mutateAsync({ jobSeekerId, jobId }).then(setReport).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSeekerId, jobId]);

  const loading = ats.isPending && !report;
  const cov = report?.keywordCoverage;
  const badParse = report?.parseable === false;

  // Loaded, parses fine, no coverage to show → nothing worth a panel.
  if (!loading && !cov && !badParse) return null;

  return (
    <>
      <div className="h-px bg-border/60 mx-4" />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("jobKeywordMatch")}</p>
          </div>
          {cov && <span className="text-sm font-bold tabular-nums">{cov.coverage}%</span>}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("readingCv")}
          </div>
        )}

        {cov && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${cov.coverage >= 60 ? "bg-emerald-500" : cov.coverage >= 30 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${cov.coverage}%` }}
              />
            </div>
            {cov.missing.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t("missing")}: {cov.missing.slice(0, 8).join(", ")}
                {cov.missing.length > 8 ? "…" : ""}
              </p>
            )}
          </div>
        )}

        {badParse && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-600 chip-pad">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t("notParseable")}</span>
          </div>
        )}
      </div>
    </>
  );
}

export function ResumeViewerModal({
  url,
  fileName,
  candidateName,
  onClose,
  applicationId,
  status,
  candidate,
  aiMatchScore,
  matchBreakdown,
  strengths,
  gaps,
  onStatusChange,
  jobSeekerId,
  jobId,
}: ResumeViewerModalProps) {
  const t = useTranslations("resumeViewerModal");
  // Only URLs with a clear image extension render as <img>; everything else
  // (including extension-less signed URLs) goes through the document path,
  // where the fetched blob's mime type decides embeddability.
  const isImage = /\.(png|jpe?g|webp|gif|bmp)([?#]|$)/i.test(url);
  const isPdf = !isImage;
  const [imgScale, setImgScale] = useState(1);
  const [imgRotation, setImgRotation] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const displayName = fileName ?? (candidateName ? `${candidateName}'s CV` : "Resume");
  const hasRightPanel = !!(candidate || aiMatchScore != null || jobSeekerId);
  const hasActions = !!(applicationId && onStatusChange);
  const statusCfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;
  const initials = getInitials(candidateName);

  const scoreColor =
    aiMatchScore == null ? "" :
    aiMatchScore >= 75 ? "text-emerald-600" :
    aiMatchScore >= 50 ? "text-amber-500" : "text-red-500";

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // The CV is streamed through our own origin, but its response carries
  // X-Frame-Options: DENY / CSP frame-ancestors 'none' (clickjacking
  // protection), so the browser refuses to frame it by URL. Instead we fetch
  // the bytes and render an in-memory blob: URL, which is exempt from those
  // directives. A missing URL, a browser without a built-in PDF viewer, or a
  // failed fetch falls back to a download prompt.
  useEffect(() => {
    if (!isPdf) return;
    setPdfBlobUrl(null);

    const canViewPdf =
      typeof navigator === "undefined" ||
      (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
    if (!url || !canViewPdf) {
      setPreviewFailed(true);
      return;
    }

    setPreviewFailed(false);
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    // Fail only if the bytes haven't arrived yet — once the blob exists the
    // iframe renders from memory and can't meaningfully hang, so a slow
    // download must not flip an already-working preview to the fallback.
    const timer = setTimeout(() => {
      if (!cancelled && !objectUrl) setPreviewFailed(true);
    }, 20000);

    fetch(url, { credentials: "same-origin", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`CV preview failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        // Non-PDF documents (doc/docx/…) can't be framed by the browser.
        if (blob.type && !blob.type.includes("pdf")) throw new Error("not embeddable");
        objectUrl = URL.createObjectURL(blob);
        clearTimeout(timer);
        setPdfBlobUrl(objectUrl);
        setPreviewFailed(false);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, isPdf]);

  // Escape: exit fullscreen first, then close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isFullscreen, onClose]);

  async function handleAction(newStatus: string) {
    if (!onStatusChange) return;
    setActionLoading(newStatus);
    try {
      await Promise.resolve(onStatusChange(newStatus));
      setCurrentStatus(newStatus);
    } finally {
      setActionLoading(null);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`relative flex flex-col bg-background shadow-2xl border border-border/60 overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? "w-screen h-screen rounded-none"
            : `rounded-2xl w-full h-[92vh] ${hasRightPanel ? "max-w-[1100px]" : "max-w-4xl"}`
        }`}
      >
        {/* ── Top Bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-background/95 backdrop-blur shrink-0 gap-3">
          {/* Left: icon + name + badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold truncate">{candidateName ?? displayName}</span>
            {statusCfg && (
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium shrink-0 ${statusCfg.pill}`}>
                {statusCfg.label}
              </span>
            )}
          </div>

          {/* Right: actions (only when NO right panel) + More + Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {hasActions && !hasRightPanel && (
              <>
                {currentStatus !== "shortlisted" && currentStatus !== "selected" && (
                  <Button size="dense" variant="outline"
                    className="gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("shortlisted")}
                  >
                    <Star className="w-3.5 h-3.5" />
                    {actionLoading === "shortlisted" ? "…" : t("shortlist")}
                  </Button>
                )}
                {currentStatus !== "interview_scheduled" && (
                  <Button size="dense" variant="outline"
                    className="gap-1.5 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("interview_scheduled")}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {actionLoading === "interview_scheduled" ? "…" : t("interview")}
                  </Button>
                )}
                {currentStatus !== "rejected" && (
                  <Button size="dense" variant="outline"
                    className="gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("rejected")}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {actionLoading === "rejected" ? "…" : t("reject")}
                  </Button>
                )}
                <div className="w-px h-5 bg-border mx-0.5" />
              </>
            )}

            {!isPdf && (
              <>
                <Button variant="ghost" size="iconDense" className=""
                  onClick={() => setImgScale((s) => Math.max(0.5, s - 0.25))} title={t("a11yZoomOut")}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="iconDense" className=""
                  onClick={() => setImgScale((s) => Math.min(3, s + 0.25))} title={t("a11yZoomIn")}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="iconDense" className=""
                  onClick={() => setImgRotation((r) => (r + 90) % 360)} title={t("a11yRotate")}>
                  <RotateCw className="w-4 h-4" />
                </Button>
              </>
            )}

            <MoreMenu url={url} displayName={displayName} />
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="iconDense"
              className=""
              onClick={() => setIsFullscreen((f) => !f)}
              title={isFullscreen ? "Exit full view" : "Full view"}
            >
              {isFullscreen
                ? <Minimize2 className="w-4 h-4" />
                : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="iconDense" className="" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* CV Viewer — padded, light bg */}
          <div className="flex-1 overflow-auto bg-gray-50 p-4">
            {isPdf ? (
              previewFailed ? (
                <div className="flex flex-col items-center justify-center min-h-full gap-3 text-center px-6">
                  <FileText className="w-10 h-10 text-muted-foreground/60" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t("previewNotAvailable")}</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {t("cvNotEmbeddable")}
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      download={displayName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      {t("openDownloadCv")}
                    </a>
                  )}
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  className="w-full h-full rounded-lg border border-border/30 shadow-sm bg-white"
                  title={displayName}
                />
              ) : (
                <div className="flex items-center justify-center min-h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" />
                </div>
              )
            ) : (
              <div className="flex items-center justify-center min-h-full">
                <img
                  src={url}
                  alt={displayName}
                  className="rounded-lg shadow-sm"
                  style={{
                    transform: `scale(${imgScale}) rotate(${imgRotation}deg)`,
                    transition: "transform 0.2s ease",
                    maxWidth: "100%",
                    transformOrigin: "center",
                  }}
                />
              </div>
            )}
          </div>

          {/* ── Decision Panel (right) ──────────────────────────────────── */}
          {hasRightPanel && (
            <aside className="w-[300px] shrink-0 border-s border-border/70 overflow-y-auto bg-background flex flex-col">

              {/* ── Candidate Identity ── */}
              <div className="p-5 space-y-4">
                {/* Avatar + name */}
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-base select-none">
                    {initials}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="font-bold text-sm leading-snug truncate">{candidateName ?? "Candidate"}</p>
                    {candidate?.role && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{t("role")}: {candidate.role}</p>
                    )}
                  </div>
                </div>

                {/* Meta: location + experience */}
                <div className="space-y-2">
                  {candidate?.location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                      <span>{candidate.location}</span>
                    </div>
                  )}
                  {candidate?.experience != null && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                      <span>{candidate.experience}+ yr{candidate.experience !== 1 ? "s" : ""} experience</span>
                    </div>
                  )}
                </div>

                {/* Skills */}
                {candidate?.skills && candidate.skills.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("skills")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.skills.slice(0, 12).map((s) => (
                        <span key={s} className="text-xs px-2.5 py-0.5 bg-muted rounded-md border border-border/60 font-medium">
                          {s}
                        </span>
                      ))}
                      {candidate.skills.length > 12 && (
                        <span className="text-xs text-muted-foreground self-center">+{candidate.skills.length - 12} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Divider ── */}
              {aiMatchScore != null && (
                <>
                  <div className="h-px bg-border/60 mx-4" />

                  {/* ── AI Insights ── */}
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("aiMatch")}</p>
                    </div>

                    {/* Big score */}
                    <div className="flex items-center gap-3">
                      <span className={`text-4xl font-extrabold tabular-nums leading-none ${scoreColor}`}>
                        {aiMatchScore}<span className="text-2xl">%</span>
                      </span>
                      <div className="flex-1 space-y-1">
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              aiMatchScore >= 75 ? "bg-emerald-500" : aiMatchScore >= 50 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${aiMatchScore}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {aiMatchScore >= 75 ? t("strongMatch") : aiMatchScore >= 50 ? t("moderateMatch") : t("lowMatch")}
                        </p>
                      </div>
                    </div>

                    {/* Breakdown bars */}
                    {matchBreakdown && (
                      <div className="space-y-3">
                        {matchBreakdown.skills != null && <ScoreBar label="Skills" value={matchBreakdown.skills} />}
                        {matchBreakdown.experience != null && <ScoreBar label="Experience" value={matchBreakdown.experience} />}
                        {matchBreakdown.location != null && <ScoreBar label="Location" value={matchBreakdown.location} />}
                      </div>
                    )}

                    {/* Strengths */}
                    {strengths && strengths.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {t("strengths")}
                        </p>
                        <ul className="space-y-1">
                          {strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <span className="text-emerald-500 shrink-0 font-bold mt-0.5">·</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Gaps */}
                    {gaps && gaps.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> {t("gaps")}
                        </p>
                        <ul className="space-y-1">
                          {gaps.map((g, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <span className="text-amber-500 shrink-0 font-bold mt-0.5">·</span>
                              {g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Job keyword match (only against a specific job) ── */}
              {jobSeekerId && jobId && (
                <AtsPanel jobSeekerId={jobSeekerId} jobId={jobId} />
              )}

              {/* ── Divider + Action Buttons (sticky bottom) ── */}
              {hasActions && (
                <div className="mt-auto border-t border-border/60 p-4 space-y-2.5 bg-background">
                  {currentStatus !== "shortlisted" && currentStatus !== "selected" && (
                    <Button
                      className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("shortlisted")}
                    >
                      <Star className="w-4 h-4" />
                      {actionLoading === "shortlisted" ? t("saving") : t("shortlistCandidate")}
                    </Button>
                  )}
                  {currentStatus === "shortlisted" && (
                    <div className="flex items-center justify-center gap-1.5 py-1 text-emerald-700 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" /> {t("shortlisted")}
                    </div>
                  )}
                  {currentStatus !== "interview_scheduled" && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("interview_scheduled")}
                    >
                      <Calendar className="w-4 h-4" />
                      {actionLoading === "interview_scheduled" ? t("saving") : t("scheduleInterview")}
                    </Button>
                  )}
                  {currentStatus !== "rejected" && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-red-300 text-red-600 hover:bg-red-50"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("rejected")}
                    >
                      <XCircle className="w-4 h-4" />
                      {actionLoading === "rejected" ? t("saving") : t("reject")}
                    </Button>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

