"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  type CalendarEvent,
  type BookingPayload,
  type BookingCandidate,
  type JobOption,
} from "@/components/shared/MployedinCalendar";
import { CalendarSkeleton } from "@/components/ui/loading/CalendarSkeleton";
import { Briefcase, CalendarDays } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

// ssr:false — calendar renders "today" from the client clock; SSR would use the
// server clock (UTC) and hydration-mismatch for users in other timezones.
const MployedinCalendar = dynamic(
  () => import("@/components/shared/MployedinCalendar"),
  { ssr: false, loading: () => <CalendarSkeleton /> },
);

export default function EmployerCalendarPage() {
  const t = useTranslations("employerCalendar");
  const tc = useTranslations("employerCommon");
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await fetch(`/api/interviews?dateFrom=${start}&dateTo=${end}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const items = data.interviews ?? data.items ?? [];
        setEvents(
          items.map((i: Record<string, unknown>) => ({
            _id: String(i._id),
            title: String(
              (i.jobSeekerId as { fullName?: string } | undefined)?.fullName ??
                i.candidateName ??
                t("candidate"),
            ),
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
      toast.error(t("failedLoadingCalendarEvents"));
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
    async (search: string, filters?: { jobId?: string; scoreMin?: number }): Promise<BookingCandidate[]> => {
      const params = new URLSearchParams({
        limit: "50",
        status: "shortlisted",
      });
      if (search.trim()) params.set("search", search.trim());
      if (filters?.jobId) params.set("jobId", filters.jobId);
      if (filters?.scoreMin) params.set("scoreMin", String(filters.scoreMin));
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
            jobId: job?._id ? String(job._id) : undefined,
            status: String(a.status ?? "shortlisted"),
            matchScore:
              typeof a.aiMatchScore === "number"
                ? a.aiMatchScore
                : typeof a.matchScore === "number"
                  ? a.matchScore
                  : undefined,
            matchStrengths: Array.isArray(a.matchStrengths)
              ? (a.matchStrengths as string[])
              : undefined,
          };
        },
      );
    },
    [],
  );

  const fetchJobs = useCallback(async (): Promise<JobOption[]> => {
    const res = await fetch("/api/jobs?myJobs=true&limit=50");
    if (!res.ok) return [];
    const data = await res.json();
    const jobsList = data.jobs ?? data.items ?? [];
    return jobsList.map((j: Record<string, unknown>) => ({
      id: String(j._id),
      title: String(j.title ?? ""),
      applicantCount: typeof j.applicationCount === "number" ? j.applicationCount : undefined,
    }));
  }, []);

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
        const err = await res.json().catch(() => ({ error: t("bookingFailed") }));
        throw new Error(err.error ?? t("bookingFailed"));
      }

      toast.success(t("interviewBookedSuccessfully"));
      // Refresh calendar events
      const now = new Date();
      fetchEvents(now.getFullYear(), now.getMonth());
    },
    [fetchEvents],
  );

  return (
    <div className="page-container space-y-6">
      {/* Hero */}
      <DashboardPageHeader
        icon={CalendarDays}
        eyebrow={t("title")}
        title={t("title")}
        description={t("description")}
        metrics={[
          { label: t("today"), value: `${todayCount} ${t("interviews")}`, icon: CalendarDays },
          { label: t("thisMonth"), value: `${upcomingCount} ${t("upcoming")}`, icon: Briefcase },
        ]}
      />

      <MployedinCalendar
        events={events}
        loading={loading}
        onMonthChange={fetchEvents}
        bookingEnabled
        onBookInterview={handleBookInterview}
        fetchCandidates={fetchCandidates}
        fetchJobs={fetchJobs}
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
