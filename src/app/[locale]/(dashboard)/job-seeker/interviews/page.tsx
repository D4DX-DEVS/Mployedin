"use client";

import { useEffect, useState, useCallback } from "react";
import { Video, MapPin, Calendar, Clock, ExternalLink, CheckCircle, AlertCircle, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

interface Interview {
  _id: string;
  applicationId: string;
  jobTitle?: string;
  companyName?: string;
  type: "video" | "offline" | "hybrid";
  scheduledAt: string;
  duration: 15 | 30 | 45 | 60;
  meetLink?: string;
  location?: string;
  notes?: string;
  status: string;
  outcome?: string;
  rescheduleCount: number;
  candidateResponse?: "pending" | "confirmed" | "declined" | "reschedule_requested";
  candidateResponseAt?: string;
  candidateRescheduleNote?: string;
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const pagination = usePagination();

  useEffect(() => {
    document.title = "Interviews · MPLOYEDIN";
  }, []);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      const res = await fetch(`/api/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        const items = data.interviews ?? data.items ?? [];
        setInterviews(items);
        pagination.updateTotal(data.total ?? items.length);
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const now = new Date();
  const upcoming = interviews.filter((i) => new Date(i.scheduledAt) >= now && i.status !== "cancelled");
  const past = interviews.filter((i) => new Date(i.scheduledAt) < now || i.status === "cancelled");

  return (
    <div className="page-container">
      <PageHeader
        title="Interviews"
        description={`${upcoming.length} upcoming · ${past.length} completed`}
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-base animate-pulse h-28" />
          ))}
        </div>
      ) : interviews.length === 0 ? (
        <div className="card-base text-center py-16">
          <Video className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No interviews scheduled</h3>
          <p className="text-sm text-muted-foreground">
            When an employer schedules an interview, it will appear here
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Upcoming</h2>
              {upcoming.map((iv) => <InterviewCard key={iv._id} interview={iv} upcoming onRefresh={fetchInterviews} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3 mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground">Past</h2>
              {past.map((iv) => <InterviewCard key={iv._id} interview={iv} upcoming={false} onRefresh={fetchInterviews} />)}
            </section>
          )}
        </>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}

function InterviewCard({ interview: iv, upcoming, onRefresh }: { interview: Interview; upcoming: boolean; onRefresh: () => void }) {
  const [responding, setResponding] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleNote, setRescheduleNote] = useState("");

  const dt = new Date(iv.scheduledAt);
  const dateStr = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const typeIcon = iv.type === "video" ? Video : MapPin;
  const TypeIcon = typeIcon;

  const isToday = new Date().toDateString() === dt.toDateString();
  const minutesUntil = Math.floor((dt.getTime() - Date.now()) / 60000);

  const canRespond = upcoming && (!iv.candidateResponse || iv.candidateResponse === "pending") &&
    ["scheduled", "rescheduled"].includes(iv.status);

  async function handleRespond(response: "confirmed" | "declined" | "reschedule_requested") {
    setResponding(true);
    try {
      const res = await fetch(`/api/interviews/${iv._id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response,
          ...(response === "reschedule_requested" && { rescheduleNote: rescheduleNote.trim() }),
        }),
      });
      if (res.ok) {
        setShowReschedule(false);
        setRescheduleNote("");
        onRefresh();
      }
    } finally {
      setResponding(false);
    }
  }

  const responseLabel = iv.candidateResponse === "confirmed" ? "Confirmed" :
    iv.candidateResponse === "declined" ? "Declined" :
    iv.candidateResponse === "reschedule_requested" ? "Reschedule Requested" : null;

  const responseColor = iv.candidateResponse === "confirmed" ? "text-emerald-600" :
    iv.candidateResponse === "declined" ? "text-red-600" :
    iv.candidateResponse === "reschedule_requested" ? "text-amber-600" : "";

  return (
    <div className={`card-base ${upcoming ? "border-primary/30 bg-primary/5" : "opacity-80"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold">{iv.jobTitle ?? "Interview"}</h3>
            {iv.companyName && (
              <span className="text-sm text-muted-foreground">at {iv.companyName}</span>
            )}
            <Badge variant={iv.type === "video" ? "secondary" : "outline"} className="text-xs capitalize">
              <TypeIcon className="w-3 h-3 me-1" /> {iv.type}
            </Badge>
            {responseLabel && (
              <Badge variant="outline" className={`text-xs ${responseColor}`}>
                {responseLabel}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {isToday ? <strong className="text-primary">Today</strong> : dateStr}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeStr} · {iv.duration} min
            </span>
          </div>

          {/* Countdown for today */}
          {upcoming && isToday && minutesUntil > 0 && minutesUntil < 60 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Starting in {minutesUntil} minutes
            </div>
          )}

          {iv.notes && (
            <p className="text-xs text-muted-foreground mt-2">{iv.notes}</p>
          )}

          {!upcoming && iv.outcome && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Outcome: <span className="capitalize">{iv.outcome}</span>
            </div>
          )}

          {/* Candidate response actions */}
          {canRespond && !showReschedule && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <Button size="sm" onClick={() => handleRespond("confirmed")} disabled={responding}>
                <Check className="w-3.5 h-3.5 me-1" /> Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReschedule(true)} disabled={responding}>
                <RotateCcw className="w-3.5 h-3.5 me-1" /> Reschedule
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
                onClick={() => handleRespond("declined")} disabled={responding}>
                <X className="w-3.5 h-3.5 me-1" /> Decline
              </Button>
            </div>
          )}

          {/* Reschedule form */}
          {canRespond && showReschedule && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <label className="text-xs font-medium">Why do you need to reschedule?</label>
              <textarea
                className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                placeholder="Please explain your scheduling conflict..."
                value={rescheduleNote}
                onChange={(e) => setRescheduleNote(e.target.value)}
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleRespond("reschedule_requested")}
                  disabled={responding || !rescheduleNote.trim()}>
                  {responding ? "Sending..." : "Request Reschedule"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowReschedule(false); setRescheduleNote(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {iv.candidateRescheduleNote && (
            <div className="mt-2 bg-amber-50 text-amber-800 text-xs p-2 rounded">
              Reschedule reason: {iv.candidateRescheduleNote}
            </div>
          )}
        </div>

        {upcoming && iv.type !== "offline" && iv.meetLink && (
          <a href={iv.meetLink} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="shrink-0">
              <Video className="w-4 h-4 me-1.5" /> Join
              <ExternalLink className="w-3 h-3 ms-1.5" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
