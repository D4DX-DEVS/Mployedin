"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { type CalendarEvent } from "@/components/shared/MployedinCalendar";
import { CalendarSkeleton } from "@/components/ui/loading/CalendarSkeleton";
import { Users } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";

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

  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await fetch(`/api/interviews?dateFrom=${start}&dateTo=${end}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const items = data.items ?? data.interviews ?? [];
        setEvents(
          items.map((i: Record<string, unknown>) => ({
            _id: String(i._id),
            title: String(i.jobTitle ?? "Interview"),
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
