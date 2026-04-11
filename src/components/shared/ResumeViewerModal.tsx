"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Download, FileText, ZoomIn, ZoomOut, RotateCw,
  MapPin, Briefcase, Star, XCircle, Calendar, Brain,
  CheckCircle2, MoreHorizontal, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

const STATUS_CONFIG: Record<string, { label: string; pill: string }> = {
  applied:             { label: "Applied",     pill: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  shortlisted:         { label: "Shortlisted", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  interview_scheduled: { label: "Interview",   pill: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  offer:               { label: "Offer",       pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  selected:            { label: "Selected",    pill: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  rejected:            { label: "Rejected",    pill: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
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
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen((o) => !o)} title="More">
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
            Download CV
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
}: ResumeViewerModalProps) {
  const isPdf = url.toLowerCase().includes(".pdf") || url.includes("application/pdf");
  const [imgScale, setImgScale] = useState(1);
  const [imgRotation, setImgRotation] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const displayName = fileName ?? (candidateName ? `${candidateName}'s CV` : "Resume");
  const hasRightPanel = !!(candidate || aiMatchScore != null);
  const hasActions = !!(applicationId && onStatusChange);
  const statusCfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;
  const initials = getInitials(candidateName);

  const scoreColor =
    aiMatchScore == null ? "" :
    aiMatchScore >= 75 ? "text-emerald-600" :
    aiMatchScore >= 50 ? "text-amber-500" : "text-red-500";

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
                  <Button size="sm" variant="outline"
                    className="h-8 gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("shortlisted")}
                  >
                    <Star className="w-3.5 h-3.5" />
                    {actionLoading === "shortlisted" ? "…" : "Shortlist"}
                  </Button>
                )}
                {currentStatus !== "interview_scheduled" && (
                  <Button size="sm" variant="outline"
                    className="h-8 gap-1.5 text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("interview_scheduled")}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {actionLoading === "interview_scheduled" ? "…" : "Interview"}
                  </Button>
                )}
                {currentStatus !== "rejected" && (
                  <Button size="sm" variant="outline"
                    className="h-8 gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                    disabled={actionLoading !== null}
                    onClick={() => handleAction("rejected")}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {actionLoading === "rejected" ? "…" : "Reject"}
                  </Button>
                )}
                <div className="w-px h-5 bg-border mx-0.5" />
              </>
            )}

            {!isPdf && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setImgScale((s) => Math.max(0.5, s - 0.25))} title="Zoom out">
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setImgScale((s) => Math.min(3, s + 0.25))} title="Zoom in">
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setImgRotation((r) => (r + 90) % 360)} title="Rotate">
                  <RotateCw className="w-4 h-4" />
                </Button>
              </>
            )}

            <MoreMenu url={url} displayName={displayName} />
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsFullscreen((f) => !f)}
              title={isFullscreen ? "Exit full view" : "Full view"}
            >
              {isFullscreen
                ? <Minimize2 className="w-4 h-4" />
                : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* CV Viewer — padded, light bg */}
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-muted/20 p-4">
            {isPdf ? (
              <iframe
                src={url}
                className="w-full h-full rounded-lg border border-border/30 shadow-sm bg-white"
                title={displayName}
              />
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
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{candidate.role}</p>
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skills</p>
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
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Match</p>
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
                          {aiMatchScore >= 75 ? "Strong match" : aiMatchScore >= 50 ? "Moderate match" : "Low match"}
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
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
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
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> Missing
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
                      {actionLoading === "shortlisted" ? "Saving…" : "Shortlist Candidate"}
                    </Button>
                  )}
                  {currentStatus === "shortlisted" && (
                    <div className="flex items-center justify-center gap-1.5 py-1 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Shortlisted
                    </div>
                  )}
                  {currentStatus !== "interview_scheduled" && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("interview_scheduled")}
                    >
                      <Calendar className="w-4 h-4" />
                      {actionLoading === "interview_scheduled" ? "Saving…" : "Schedule Interview"}
                    </Button>
                  )}
                  {currentStatus !== "rejected" && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      disabled={actionLoading !== null}
                      onClick={() => handleAction("rejected")}
                    >
                      <XCircle className="w-4 h-4" />
                      {actionLoading === "rejected" ? "Saving…" : "Reject"}
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

