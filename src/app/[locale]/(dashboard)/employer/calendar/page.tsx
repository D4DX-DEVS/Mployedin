"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import GoogleCalendar, {
  type CalendarEvent,
  type BookingPayload,
  type BookingCandidate,
} from "@/components/shared/GoogleCalendar";
import { Briefcase } from "lucide-react";

export default function EmployerCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await fetch(`/api/interviews?dateFrom=${start}&dateTo=${end}`);
      if (res.ok) {
        const data = await res.json();
        const items = data.interviews ?? data.items ?? [];
        setEvents(
          items.map((i: Record<string, unknown>) => ({
            _id: String(i._id),
            title: String(i.candidateName ?? "Candidate"),
            subtitle: String(i.jobTitle ?? ""),
            type: (i.type as CalendarEvent["type"]) ?? "video",
            status: String(i.status ?? "scheduled"),
            scheduledAt: String(i.scheduledAt ?? i.createdAt),
            duration: i.duration as number | undefined,
            meetLink: i.meetLink as string | undefined,
            location: i.location as string | undefined,
          })),
        );
      }
    } catch {
      toast.error("Failed to load calendar events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    fetchEvents(now.getFullYear(), now.getMonth());
  }, [fetchEvents]);

  const today = new Date();
  const todayCount = useMemo(
    () =>
      events.filter(
        (e) =>
          new Date(e.scheduledAt).toDateString() === today.toDateString(),
      ).length,
    [events, today],
  );
  const upcomingCount = useMemo(
    () => events.filter((e) => new Date(e.scheduledAt) >= today).length,
    [events, today],
  );

  const fetchCandidates = useCallback(
    async (search: string): Promise<BookingCandidate[]> => {
      const params = new URLSearchParams({
        limit: "20",
        status: "shortlisted",
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/applications?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      const apps = data.applications ?? data.items ?? [];
      return apps.map(
        (a: Record<string, unknown>) => {
          const seeker = a.jobSeekerId as Record<string, unknown> | undefined;
          const job = a.jobId as Record<string, unknown> | undefined;
          return {
            applicationId: String(a._id),
            candidateName: String(
              seeker?.fullName ?? seeker?.name ?? "Candidate",
            ),
            jobTitle: String(job?.title ?? ""),
            status: String(a.status ?? "shortlisted"),
          };
        },
      );
    },
    [],
  );

  const handleBookInterview = useCallback(
    async (payload: BookingPayload) => {
      const scheduledAt = new Date(
        `${payload.date}T${payload.time}:00`,
      ).toISOString();

      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: payload.applicationId,
          scheduledAt,
          duration: payload.duration,
          type: payload.type,
          instructions: payload.notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Booking failed" }));
        throw new Error(err.error ?? "Failed to book interview");
      }

      toast.success("Interview booked successfully");
      // Refresh calendar events
      const now = new Date();
      fetchEvents(now.getFullYear(), now.getMonth());
    },
    [fetchEvents],
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Interview Calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual overview of all scheduled interviews
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Today
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {todayCount} interviews
            </p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              This Month
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {upcomingCount} upcoming
            </p>
          </div>
        </div>
      </section>

      <GoogleCalendar
        events={events}
        loading={loading}
        onMonthChange={fetchEvents}
        bookingEnabled
        onBookInterview={handleBookInterview}
        fetchCandidates={fetchCandidates}
        renderEventExtra={(e) => (
          <>
            {e.subtitle && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3 flex-shrink-0" />
                {e.subtitle}
              </p>
            )}
          </>
        )}
      />
    </div>
  );
}
