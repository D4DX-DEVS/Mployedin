"use client";

import * as React from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
  setHours,
  setMinutes,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: string; // ISO or datetime-local format
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: Date;
  className?: string;
  required?: boolean;
  /** "datetime" shows date+time; "date" shows date only; "time" shows time only */
  mode?: "datetime" | "date" | "time";
  container?: HTMLElement | null;
  modal?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  label,
  placeholder,
  minDate,
  className,
  required,
  mode = "datetime",
  container,
  modal = false,
}: DateTimePickerProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isRtl = locale === "ar";
  // The default used to be the English literal "Pick date & time", which stayed
  // English in /ar and said "time" on date-only pickers.
  const resolvedPlaceholder =
    placeholder ?? t(mode === "date" ? "pickDate" : mode === "time" ? "pickTime" : "pickDateTime");
  const parsed = value ? new Date(value) : null;
  const [viewMonth, setViewMonth] = React.useState(
    parsed ?? new Date()
  );
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(parsed);
  const [hour, setHour] = React.useState(parsed ? parsed.getHours() : 9);
  const [minute, setMinute] = React.useState(parsed ? parsed.getMinutes() : 0);
  const [open, setOpen] = React.useState(false);

  // Sync external value changes
  React.useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setViewMonth(d);
        setHour(d.getHours());
        setMinute(d.getMinutes());
      }
    } else {
      setSelectedDate(null);
    }
  }, [value]);

  function emitChange(date: Date | null, h: number, m: number) {
    if (!date && mode !== "time") return;
    if (mode === "date" && date) {
      // yyyy-MM-dd
      onChange(format(date, "yyyy-MM-dd"));
    } else if (mode === "time") {
      const pad = (n: number) => String(n).padStart(2, "0");
      onChange(`${pad(h)}:${pad(m)}`);
    } else if (date) {
      const dt = setMinutes(setHours(date, h), m);
      // ISO 8601 format for API compatibility
      onChange(dt.toISOString());
    }
  }

  function handleSelectDate(day: Date) {
    setSelectedDate(day);
    // Auto-correct time if selected date is today (or minDate day) and current time is in the past
    let h = hour;
    let m = minute;
    if (minDate && isSameDay(day, minDate)) {
      if (h < minDate.getHours()) {
        h = minDate.getHours();
        m = Math.ceil(minDate.getMinutes() / 5) * 5;
        if (m >= 60) { h += 1; m = 0; }
      } else if (h === minDate.getHours() && m < minDate.getMinutes()) {
        m = Math.ceil(minDate.getMinutes() / 5) * 5;
        if (m >= 60) { h += 1; m = 0; }
      }
      setHour(h);
      setMinute(m);
    }
    if (mode === "date") {
      emitChange(day, h, m);
      setOpen(false);
    } else {
      emitChange(day, h, m);
    }
  }

  function handleTimeChange(h: number, m: number) {
    setHour(h);
    setMinute(m);
    emitChange(selectedDate, h, m);
  }

  // Calendar grid
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

  const displayValue = React.useMemo(() => {
    if (!value) return "";
    if (mode === "time") {
      const [hh, mm] = value.split(":").map(Number);
      const d = new Date();
      d.setHours(hh, mm);
      return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    if (!parsed || isNaN(parsed.getTime())) return "";
    if (mode === "date") return parsed.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
    return `${parsed.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })} · ${parsed.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true })}`;
  }, [value, mode, parsed, locale]);

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium mb-1.5">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label ?? resolvedPlaceholder}
            className={cn(
              "w-full h-9 px-3 text-sm text-start flex items-center gap-2 rounded-lg border border-border bg-background transition-colors",
              "hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">
              {displayValue || resolvedPlaceholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 rounded-xl border border-border/60 shadow-xl"
          align="start"
          sideOffset={6}
          container={container}
        >
          <div className="flex">
            {/* Calendar side */}
            {mode !== "time" && (
              <div className="p-3">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                  >
                    {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </button>
                  <span className="text-sm font-semibold">
                    {viewMonth.toLocaleDateString(locale, { month: "long", year: "numeric" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                  >
                    {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-0" role="row">
                  {weekDayKeys.map((key) => (
                    <div
                      key={key}
                      role="columnheader"
                      className="h-8 w-8 flex items-center justify-center text-[11px] font-medium text-muted-foreground"
                    >
                      {t(`weekdaysMini.${key}`)}
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-0" role="grid">
                  {days.map((day) => {
                    const inMonth = isSameMonth(day, viewMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const today = isToday(day);
                    const disabled =
                      minDate && isBefore(day, startOfDay(minDate));

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        disabled={!!disabled}
                        onClick={() => handleSelectDate(day)}
                        role="gridcell"
                        aria-selected={!!isSelected}
                        aria-current={today ? "date" : undefined}
                        aria-label={day.toLocaleDateString(locale, { month: "long", day: "numeric" })}
                        className={cn(
                          "h-8 w-8 flex items-center justify-center rounded-md text-sm transition-all",
                          !inMonth && "text-muted-foreground/40",
                          inMonth && !isSelected && "hover:bg-accent",
                          inMonth && today && !isSelected && "font-semibold text-primary",
                          isSelected &&
                            "bg-primary text-primary-foreground font-semibold shadow-sm",
                          disabled && "opacity-30 cursor-not-allowed"
                        )}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(null);
                      onChange("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("clear")}
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setViewMonth(today);
                      handleSelectDate(today);
                    }}
                    className="text-xs text-primary font-medium hover:text-primary/80 transition-colors"
                  >
                    {t("today")}
                  </button>
                </div>
              </div>
            )}

            {/* Time side */}
            {mode !== "date" && (
              <div
                className={cn(
                  "p-3 flex flex-col",
                  mode !== "time" &&
                    "border-s border-border/40"
                )}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("time")}
                  </span>
                </div>
                <div className="flex gap-1 flex-1 min-h-0">
                  {/* Hour column */}
                  <TimeColumn
                    items={Array.from({ length: 24 }, (_, i) => ({
                      value: i,
                      label: String(i).padStart(2, "0"),
                      disabled: !!(minDate && selectedDate && isSameDay(selectedDate, minDate) && i < minDate.getHours()),
                    }))}
                    selected={hour}
                    onSelect={(v) => handleTimeChange(v, minute)}
                  />
                  {/* Minute column */}
                  <TimeColumn
                    items={Array.from({ length: 12 }, (_, i) => ({
                      value: i * 5,
                      label: String(i * 5).padStart(2, "0"),
                      disabled: !!(minDate && selectedDate && isSameDay(selectedDate, minDate) && hour === minDate.getHours() && i * 5 < minDate.getMinutes()),
                    }))}
                    selected={minute}
                    onSelect={(v) => handleTimeChange(hour, v)}
                  />
                  {/* AM/PM indicator */}
                  <div className="flex flex-col gap-1 ms-1">
                    <button
                      type="button"
                      onClick={() => {
                        const newH = hour >= 12 ? hour - 12 : hour;
                        handleTimeChange(newH, minute);
                      }}
                      className={cn(
                        "px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                        hour < 12
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {t("am")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newH = hour < 12 ? hour + 12 : hour;
                        handleTimeChange(newH, minute);
                      }}
                      className={cn(
                        "px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                        hour >= 12
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {t("pm")}
                    </button>
                  </div>
                </div>

                {/* Done button for datetime mode */}
                {mode === "datetime" && (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mt-2 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    {t("done")}
                  </button>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─── Scrollable time column ─── */
function TimeColumn({
  items,
  selected,
  onSelect,
}: {
  items: { value: number; label: string; disabled?: boolean }[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Scroll selected item into view on mount
  React.useEffect(() => {
    if (!containerRef.current) return;
    const idx = items.findIndex((i) => i.value === selected);
    if (idx >= 0) {
      const child = containerRef.current.children[idx] as HTMLElement;
      child?.scrollIntoView({ block: "center", behavior: "instant" });
    }
    // Only on mount
     
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-0.5 overflow-y-auto max-h-[200px] min-w-[40px] scrollbar-thin pe-0.5"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={item.disabled}
          onClick={() => onSelect(item.value)}
          className={cn(
            "h-7 min-w-[36px] rounded-md text-xs font-medium transition-all flex items-center justify-center",
            item.disabled && "opacity-30 cursor-not-allowed",
            selected === item.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-accent"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
