"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { type CalendarEvent } from "@/components/shared/MployedinCalendar";
import { CalendarSkeleton } from "@/components/ui/loading/CalendarSkeleton";
import { Users } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";

// Distinguishes the two non-interview sources at a glance; the calendar
// takes an accent override per event.
const TASK_COLOR = "#b45309";
const FOLLOW_UP_COLOR = "#0f766e";

// ssr:false — calendar renders "today" from the client clock; SSR would use the
// server clock (UTC) and hydration-mismatch for users in other timezones.
const MployedinCalendar = dynamic(
  () => import("@/components/shared/MployedinCalendar"),
  { ssr: false, loading: () => <CalendarSkeleton /> },
);

export default function AgentCalendarPage() {
  const t = useTranslations("agentCalendar");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // The calendar showed interviews and nothing else, so an agent's week lived
  // across three surfaces: interviews here, task due dates on the tasks page,
  // lead follow-up dates on the leads page. All three land here now, colour-
  // coded by source, and each event links back to the list it came from.
  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    try {
      const [interviewRes, taskRes, leadRes] = await Promise.all([
        fetch(`/api/interviews?dateFrom=${start}&dateTo=${end}&limit=100`),
        fetch(`/api/agent/tasks?dueFrom=${start}&dueTo=${end}&limit=100`),
        fetch(`/api/leads?followUpFrom=${start}&followUpTo=${end}&limit=100`),
      ]);

      const next: CalendarEvent[] = [];

      if (interviewRes.ok) {
        const data = await interviewRes.json();
        const items = data.items ?? data.interviews ?? [];
        next.push(
          ...items.map((i: Record<string, unknown>) => ({
            _id: `interview-${String(i._id)}`,
            title: String(i.jobTitle ?? t("eventInterview")),
            subtitle: String(
              (i.jobSeekerId as { fullName?: string } | undefined)?.fullName ??
                i.candidateName ??
                "",
            ),
            type: (i.type as CalendarEvent["type"]) ?? "video",
            status: String(i.status ?? "scheduled"),
            scheduledAt: String(i.scheduledAt ?? i.createdAt),
            duration: i.duration as number | undefined,
            meetLink: i.meetLink as string | undefined,
            location: i.location as string | undefined,
          })),
        );
      }

      if (taskRes.ok) {
        const data = await taskRes.json();
        next.push(
          ...(data.items ?? [])
            .filter((task: Record<string, unknown>) => Boolean(task.dueDate))
            .map((task: Record<string, unknown>) => ({
              _id: `task-${String(task._id)}`,
              title: String(task.title ?? ""),
              subtitle: t("eventTask"),
              type: "offline" as const,
              status: String(task.status ?? "pending"),
              scheduledAt: String(task.dueDate),
              color: TASK_COLOR,
            })),
        );
      }

      if (leadRes.ok) {
        const data = await leadRes.json();
        next.push(
          ...(data.items ?? [])
            .filter((lead: Record<string, unknown>) => Boolean(lead.followUpAt))
            .map((lead: Record<string, unknown>) => ({
              _id: `lead-${String(lead._id)}`,
              title: String(lead.companyName ?? ""),
              subtitle: t("eventFollowUp"),
              type: "offline" as const,
              status: String(lead.status ?? "new"),
              scheduledAt: String(lead.followUpAt),
              color: FOLLOW_UP_COLOR,
            })),
        );
      }

      setEvents(next);
    } catch {
      toast.error(t("failedLoadingCalendarEvents"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const now = new Date();
    fetchEvents(now.getFullYear(), now.getMonth());
  }, [fetchEvents]);

  return (
    <div className="page-container">
      {/* Hero */}
      <PageHero
        title={t("title")}
        description={t("description")}
      />

      <MployedinCalendar
        events={events}
        loading={loading}
        onMonthChange={fetchEvents}
        renderEventExtra={(e) =>
          e.subtitle ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3 flex-shrink-0" />
              {e.subtitle}
            </p>
          ) : null
        }
      />
    </div>
  );
}
