"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { type CalendarEvent } from "@/components/shared/MployedinCalendar";
import { CalendarSkeleton } from "@/components/ui/loading/CalendarSkeleton";
import { Building2 } from "lucide-react";

// ssr:false — calendar renders "today" from the client clock; SSR would use the
// server clock (UTC) and hydration-mismatch for users in other timezones.
const MployedinCalendar = dynamic(
  () => import("@/components/shared/MployedinCalendar"),
  { ssr: false, loading: () => <CalendarSkeleton /> },
);

export default function JobSeekerCalendarPage() {
  const t = useTranslations("jobSeekerCalendar");
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
            title: String(i.jobTitle ?? t("interviewFallback")),
            subtitle: String(i.companyName ?? ""),
            type: (i.type as CalendarEvent["type"]) ?? "video",
            status: String(i.status ?? "scheduled"),
            scheduledAt: String(i.scheduledAt ?? i.createdAt),
            duration: i.duration as number | undefined,
            meetLink: i.meetLink as string | undefined,
            location: i.location as string | undefined,
          })),
        );
      } else {
        toast.error(t("loadFailed"));
      }
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const now = new Date();
    fetchEvents(now.getFullYear(), now.getMonth());
  }, [fetchEvents]);

  return (
    <div className="space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </section>

      <MployedinCalendar
        events={events}
        loading={loading}
        onMonthChange={fetchEvents}
        renderEventExtra={(e) =>
          e.subtitle ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              {e.subtitle}
            </p>
          ) : null
        }
      />
    </div>
  );
}
