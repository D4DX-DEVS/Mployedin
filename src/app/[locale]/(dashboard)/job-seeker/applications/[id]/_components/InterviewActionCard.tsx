"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, Check, Clock, ExternalLink, Loader2, MapPin, RotateCcw, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { applicationNumberLocale } from "@/lib/jobSeeker/applicationFormat";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { InterviewItem } from "./types";

// ── Interview Action Card ──────────────────────────────────────────
export function InterviewActionCard({ interview: iv, onUpdated }: { interview: InterviewItem; onUpdated: () => void }) {
  const numberLocale = applicationNumberLocale(useLocale());
  const t = useTranslations("applicationDetail");
  // Static keys: next-intl throws on an unknown key, so stored values that
  // aren't in the enum fall back to the raw value instead of a dynamic t().
  const interviewTypeLabel = (type: string) => {
    switch (type) {
      case "video": return t("interviewType.video");
      case "offline": return t("interviewType.offline");
      case "hybrid": return t("interviewType.hybrid");
      default: return type;
    }
  };
  const outcomeLabel = (outcome: string) => {
    switch (outcome) {
      case "passed": return t("outcomes.passed");
      case "failed": return t("outcomes.failed");
      case "hold": return t("outcomes.hold");
      case "no_show": return t("outcomes.noShow");
      default: return outcome.replace("_", " ");
    }
  };
  const [responding, setResponding] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleNote, setRescheduleNote] = useState("");

  const upcoming = new Date(iv.scheduledAt) >= new Date();
  const canRespond = upcoming && (!iv.candidateResponse || iv.candidateResponse === "pending") &&
    ["scheduled", "rescheduled"].includes(iv.status);

  async function handleRespond(response: "confirmed" | "declined" | "reschedule_requested") {
    setResponding(true);
    try {
      const res = await csrfFetch(`/api/interviews/${iv._id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response,
          ...(response === "reschedule_requested" && { rescheduleNote: rescheduleNote.trim() }),
        }),
      });
      if (res.ok) {
        onUpdated();
        setShowReschedule(false);
      }
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="card-base rounded-xl border space-y-2.5 panel-body">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {iv.type === "video" ? <Video className="h-3 w-3 me-1" /> : <MapPin className="h-3 w-3 me-1" />}
            {interviewTypeLabel(iv.type)} · {t("interviewRound", { round: iv.interviewRound })}
          </Badge>
          <StatusBadge status={iv.status} size="sm" />
        </div>
        {iv.candidateResponse && iv.candidateResponse !== "pending" && (
          <Badge variant="outline" className={cn(
            "text-xs",
            iv.candidateResponse === "confirmed" && "bg-emerald-50 text-emerald-700 border-emerald-200",
            iv.candidateResponse === "declined" && "bg-red-50 text-red-700 border-red-200",
            iv.candidateResponse === "reschedule_requested" && "bg-amber-50 text-amber-700 border-amber-200",
          )}>
            {iv.candidateResponse === "confirmed" ? t("confirmed") : iv.candidateResponse === "declined" ? t("declined") : t("rescheduleRequested")}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(iv.scheduledAt).toLocaleDateString(numberLocale, { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(iv.scheduledAt).toLocaleTimeString(numberLocale, { hour: "2-digit", minute: "2-digit" })} · {iv.duration}{t("minSuffix")}
        </span>
        {iv.meetLink && (
          <a href={iv.meetLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> {t("joinMeeting")}
          </a>
        )}
        {iv.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{iv.location}</span>}
      </div>

      {iv.instructions && (
        <p className="text-xs italic text-muted-foreground">{iv.instructions}</p>
      )}

      {iv.outcome && (
        <div className="text-xs">
          {t("outcome")}: <span className="font-medium">{outcomeLabel(iv.outcome)}</span>
        </div>
      )}

      {/* Action Buttons */}
      {canRespond && !showReschedule && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="dense"
            className="gap-1.5"
            onClick={() => handleRespond("confirmed")}
            disabled={responding}
          >
            {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("confirm")}
          </Button>
          <Button
            size="dense"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowReschedule(true)}
            disabled={responding}
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("reschedule")}
          </Button>
          <Button
            size="dense"
            variant="ghost"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => handleRespond("declined")}
            disabled={responding}
          >
            <X className="h-3.5 w-3.5" /> {t("decline")}
          </Button>
        </div>
      )}

      {/* Reschedule Form */}
      {showReschedule && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea
            placeholder={t("rescheduleReasonPlaceholder")}
            value={rescheduleNote}
            onChange={(e) => setRescheduleNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="dense"
              className=""
              onClick={() => handleRespond("reschedule_requested")}
              disabled={!rescheduleNote.trim() || responding}
            >
              {responding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {t("requestReschedule")}
            </Button>
            <Button size="dense" variant="ghost" className="" onClick={() => setShowReschedule(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
