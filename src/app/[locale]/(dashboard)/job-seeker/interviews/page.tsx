"use client";

import { useEffect, useState } from "react";
import { Video, MapPin, Calendar, Clock, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";

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
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Interviews · MPLOYEDIN";
    fetchInterviews();
  }, []);

  async function fetchInterviews() {
    try {
      const res = await fetch("/api/interviews");
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.interviews ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  const upcoming = interviews.filter((i) => new Date(i.scheduledAt) >= now && i.status !== "cancelled");
  const past = interviews.filter((i) => new Date(i.scheduledAt) < now || i.status === "cancelled");

  return (
    <div className="p-6 space-y-6">
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
              {upcoming.map((iv) => <InterviewCard key={iv._id} interview={iv} upcoming />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3 mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground">Past</h2>
              {past.map((iv) => <InterviewCard key={iv._id} interview={iv} upcoming={false} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function InterviewCard({ interview: iv, upcoming }: { interview: Interview; upcoming: boolean }) {
  const dt = new Date(iv.scheduledAt);
  const dateStr = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const typeIcon = iv.type === "video" ? Video : MapPin;
  const TypeIcon = typeIcon;

  const isToday = new Date().toDateString() === dt.toDateString();
  const minutesUntil = Math.floor((dt.getTime() - Date.now()) / 60000);

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
