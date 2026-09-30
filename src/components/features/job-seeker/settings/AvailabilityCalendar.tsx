"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Clock, Globe, CheckCircle2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useTimezoneOptions } from "@/lib/i18n/useTimezoneOptions";
import { useWeekdayLabels, WEEKDAY_CODES } from "@/lib/i18n/useWeekdayLabels";

export interface DayAvailability {
  day: string;
  startTime: string;
  endTime: string;
}

interface AvailabilityCalendarProps {
  /** Currently selected days (e.g. ["Mon","Tue","Fri"]) */
  selectedDays: string[];
  onDaysChange: (days: string[]) => void;
  /** Per-day hour ranges */
  availableHours: DayAvailability[];
  onHoursChange: (hours: DayAvailability[]) => void;
  /** IANA timezone (e.g. "Asia/Dubai") */
  timezone: string;
  onTimezoneChange: (tz: string) => void;
}

const DAYS = WEEKDAY_CODES;

const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30; // 06:00 to 22:00
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

/** Common zones for the Gulf/MENA region plus major global ones. */
const TIMEZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat",
  "Africa/Cairo", "Asia/Karachi", "Asia/Kolkata", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney",
];

export function AvailabilityCalendar({
  selectedDays,
  onDaysChange,
  availableHours,
  onHoursChange,
  timezone,
  onTimezoneChange,
}: AvailabilityCalendarProps) {
  const t = useTranslations("availabilityCalendar");
  const days = useWeekdayLabels();
  const hoursMap = new Map(availableHours.map((h) => [h.day, h]));
  const { options: timezoneOptions, value: selectedZone } = useTimezoneOptions(TIMEZONES, timezone);

  const toggleDay = useCallback(
    (day: string) => {
      const active = selectedDays.includes(day);
      if (active) {
        onDaysChange(selectedDays.filter((d) => d !== day));
        onHoursChange(availableHours.filter((h) => h.day !== day));
      } else {
        onDaysChange([...selectedDays, day]);
        onHoursChange([...availableHours, { day, startTime: DEFAULT_START, endTime: DEFAULT_END }]);
      }
    },
    [selectedDays, onDaysChange, availableHours, onHoursChange],
  );

  const updateHour = useCallback(
    (day: string, field: "startTime" | "endTime", value: string) => {
      const existing = availableHours.find((h) => h.day === day);
      if (!existing) return;
      const updated = availableHours.map((h) =>
        h.day === day ? { ...h, [field]: value } : h,
      );
      onHoursChange(updated);
    },
    [availableHours, onHoursChange],
  );

  return (
    <div className="space-y-4">
      {/* Timezone selector */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("yourTimezone")}</p>
        </div>
        <SearchableSelect
          className="h-9 w-64 text-sm rounded-lg"
          ariaLabel={t("yourTimezone")}
          options={timezoneOptions}
          value={selectedZone}
          onValueChange={onTimezoneChange}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("timezoneDescription")}
        </p>
      </div>

      {/* Day selector chips */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">{t("availableDays")}</p>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map((day) => {
            const active = selectedDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                aria-label={days[day].full}
                onClick={() => toggleDay(day)}
                className={`h-10 min-w-12 rounded-xl border px-2 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {days[day].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-day time ranges */}
      {selectedDays.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("workingHours")}</p>
          </div>
          <div className="space-y-2">
            {DAYS.filter((d) => selectedDays.includes(d)).map((day) => {
              const hours = hoursMap.get(day);
              const dayName = days[day].full;
              return (
                <div key={day} className="flex items-center gap-3 py-1.5">
                  {/* Arabic shows the full day name, so its column is wider. */}
                  <span className="w-10 shrink-0 text-xs font-semibold text-muted-foreground rtl:w-16">
                    {days[day].label}
                  </span>
                  <SearchableSelect
                    className="h-8 w-24 text-xs rounded-lg"
                    ariaLabel={t("startTimeFor", { day: dayName })}
                    options={TIME_OPTIONS}
                    value={hours?.startTime ?? DEFAULT_START}
                    onValueChange={(v) => updateHour(day, "startTime", v)}
                  />
                  <span className="text-xs text-muted-foreground">{t("to")}</span>
                  <SearchableSelect
                    className="h-8 w-24 text-xs rounded-lg"
                    ariaLabel={t("endTimeFor", { day: dayName })}
                    options={TIME_OPTIONS}
                    value={hours?.endTime ?? DEFAULT_END}
                    onValueChange={(v) => updateHour(day, "endTime", v)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary badge */}
      {selectedDays.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 chip-pad">
          <p className="flex items-start gap-1.5 text-xs text-primary font-medium">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("availabilityActive")}
          </p>
        </div>
      )}
    </div>
  );
}
