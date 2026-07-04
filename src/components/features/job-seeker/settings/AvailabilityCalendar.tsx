"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Clock, Globe } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

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

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30; // 06:00 to 22:00
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

/** Common IANA timezones for Gulf/MENA region + major global zones */
const TIMEZONE_OPTIONS = [
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)" },
  { value: "Asia/Qatar", label: "Qatar (GMT+3)" },
  { value: "Asia/Kuwait", label: "Kuwait (GMT+3)" },
  { value: "Asia/Bahrain", label: "Bahrain (GMT+3)" },
  { value: "Asia/Muscat", label: "Muscat (GMT+4)" },
  { value: "Africa/Cairo", label: "Cairo (GMT+2)" },
  { value: "Asia/Karachi", label: "Karachi (GMT+5)" },
  { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
  { value: "Europe/London", label: "London (GMT+0/+1)" },
  { value: "Europe/Berlin", label: "Berlin (GMT+1/+2)" },
  { value: "America/New_York", label: "New York (GMT-5/-4)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8/-7)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)" },
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
  const hoursMap = new Map(availableHours.map((h) => [h.day, h]));

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
          options={TIMEZONE_OPTIONS}
          value={timezone}
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
                onClick={() => toggleDay(day)}
                className={`h-10 w-12 rounded-xl border text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {day}
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
              return (
                <div key={day} className="flex items-center gap-3 py-1.5">
                  <span className="w-10 text-xs font-semibold text-muted-foreground">{day}</span>
                  <SearchableSelect
                    className="h-8 w-24 text-xs rounded-lg"
                    options={TIME_OPTIONS}
                    value={hours?.startTime ?? DEFAULT_START}
                    onValueChange={(v) => updateHour(day, "startTime", v)}
                  />
                  <span className="text-xs text-muted-foreground">{t("to")}</span>
                  <SearchableSelect
                    className="h-8 w-24 text-xs rounded-lg"
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
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-xs text-primary font-medium">
            {t("availabilityActive")}
          </p>
        </div>
      )}
    </div>
  );
}
