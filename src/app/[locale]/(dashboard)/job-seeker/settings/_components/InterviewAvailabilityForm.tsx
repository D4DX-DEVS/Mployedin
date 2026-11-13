"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Info, Loader2, Save, Settings2 } from "lucide-react";
import { getSeekerJson, SEEKER_FRESH_MS, seekerKeys } from "@/hooks/useSeekerCache";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AvailabilityCalendar } from "@/components/features/job-seeker/settings/AvailabilityCalendar";
import { CalendarFeedCard } from "@/components/features/settings/CalendarFeedCard";
import { getCsrfToken } from "@/lib/security/csrf-client";

/**
 * Interview booking hours — the only part of the old settings form that
 * anything reads (interview scheduling and the availability API). The route
 * merges per key, so saving these fields leaves every other setting alone.
 */
const availabilitySchema = z.object({
  instantBooking: z.boolean(),
  timezone: z.string(),
  timeBuffer: z.number().int().min(0).max(120),
  weeklyAvailability: z.array(z.string()),
  availableHours: z.array(z.object({ day: z.string(), startTime: z.string(), endTime: z.string() })),
});

type AvailabilityForm = z.infer<typeof availabilitySchema>;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const DEFAULTS: AvailabilityForm = {
  instantBooking: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  timeBuffer: 30,
  weeklyAvailability: [...WEEKDAYS],
  availableHours: WEEKDAYS.map((day) => ({ day, startTime: "09:00", endTime: "17:00" })),
};

const BUFFER_MINUTES = [0, 15, 30, 60] as const;

interface CardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingCard({ icon, title, description, children }: CardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="shrink-0 rounded-xl bg-muted p-2.5 text-muted-foreground">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Separator />
      <div className="divide-y divide-border/50 px-5 py-2">{children}</div>
    </section>
  );
}

export function InterviewAvailabilityForm() {
  const t = useTranslations("jobSeekerExtra.settings");
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { control, watch, handleSubmit, reset, formState } = useForm<AvailabilityForm>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: DEFAULTS,
  });
  const instantBooking = watch("instantBooking");

  useEffect(() => {
    queryClient
      .fetchQuery({
        queryKey: seekerKeys.settings,
        queryFn: () => getSeekerJson<{ settings?: Partial<AvailabilityForm> }>("/api/job-seekers/settings"),
        staleTime: SEEKER_FRESH_MS,
      })
      .then((d) => {
        const s = d.settings ?? {};
        reset({
          instantBooking: s.instantBooking ?? DEFAULTS.instantBooking,
          timezone: s.timezone ?? DEFAULTS.timezone,
          timeBuffer: s.timeBuffer ?? DEFAULTS.timeBuffer,
          weeklyAvailability: s.weeklyAvailability ?? DEFAULTS.weeklyAvailability,
          availableHours: s.availableHours ?? DEFAULTS.availableHours,
        });
      })
      .catch(() => toast.error(t("loadFailed")))
      .finally(() => setLoading(false));
  }, [reset, queryClient, t]);

  const onSubmit = async (data: AvailabilityForm) => {
    setSaving(true);
    try {
      const res = await fetch("/api/job-seekers/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({ settings: data }),
      });
      if (!res.ok) throw new Error("save");
      reset(data);
      void queryClient.invalidateQueries({ queryKey: seekerKeys.settings });
      toast.success(t("savedToast"));
    } catch {
      toast.error(t("failedToast"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <SettingCard
          icon={<CalendarDays className="h-4 w-4" />}
          title={t("interviews.title")}
          description={t("interviews.description")}
        >
          <div className="flex items-center justify-between gap-6 py-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="instant-booking" className="text-sm font-medium text-foreground">
                {t("interviews.instantBooking")}
              </label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("interviews.instantBookingDescription")}</p>
            </div>
            <Controller
              control={control}
              name="instantBooking"
              render={({ field }) => (
                <Switch id="instant-booking" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </SettingCard>

        {instantBooking && (
          <SettingCard
            icon={<Settings2 className="h-4 w-4" />}
            title={t("interviews.availabilityTitle")}
            description={t("interviews.availabilityDescription")}
          >
            <div className="py-3">
              <Controller
                control={control}
                name="weeklyAvailability"
                render={({ field: days }) => (
                  <Controller
                    control={control}
                    name="availableHours"
                    render={({ field: hours }) => (
                      <Controller
                        control={control}
                        name="timezone"
                        render={({ field: tz }) => (
                          <AvailabilityCalendar
                            selectedDays={days.value}
                            onDaysChange={days.onChange}
                            availableHours={hours.value}
                            onHoursChange={hours.onChange}
                            timezone={tz.value}
                            onTimezoneChange={tz.onChange}
                          />
                        )}
                      />
                    )}
                  />
                )}
              />
            </div>
            <div className="flex items-center justify-between gap-6 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="interview-buffer" className="text-sm font-medium text-foreground">
                    {t("interviews.buffer")}
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground/60" aria-label={t("interviews.bufferTooltip")} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">{t("interviews.bufferTooltip")}</TooltipContent>
                  </Tooltip>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("interviews.bufferDescription")}</p>
              </div>
              <Controller
                control={control}
                name="timeBuffer"
                render={({ field }) => (
                  <SearchableSelect
                    id="interview-buffer"
                    className="h-8 w-32 rounded-lg text-sm"
                    ariaLabel={t("interviews.buffer")}
                    options={BUFFER_MINUTES.map((m) => ({
                      value: String(m),
                      label: m === 0 ? t("interviews.noBuffer") : t("interviews.minutes", { count: m }),
                    }))}
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  />
                )}
              />
            </div>
          </SettingCard>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {formState.isDirty && <p className="me-auto text-xs text-muted-foreground">{t("unsavedChanges")}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => reset()} disabled={!formState.isDirty || saving}>
            {t("discard")}
          </Button>
          <Button type="submit" size="sm" disabled={!formState.isDirty || saving} className="min-w-[110px] gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? t("saving") : t("saveSettings")}
          </Button>
        </div>
      </form>

      <div className="mt-5">
        <CalendarFeedCard />
      </div>
    </TooltipProvider>
  );
}
