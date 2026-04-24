"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  Phone,
  Clock,
  X,
  LayoutGrid,
  List,
  CalendarDays,
  Plus,
  AlertCircle,
  Search,
  User,
  ArrowLeft,
  Briefcase,
} from "lucide-react";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface CalendarEvent {
  _id: string;
  title: string;
  subtitle?: string;
  type: "video" | "offline" | "hybrid";
  status: string;
  scheduledAt: string;
  duration?: number; // minutes
  meetLink?: string;
  location?: string;
  color?: string; // override accent
}

export type CalendarViewMode = "month" | "week" | "day";

export interface BookingCandidate {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: string;
  matchScore?: number;
  matchStrengths?: string[];
}

export interface BookingPayload {
  applicationId: string;
  date: string; // ISO date string
  time: string; // HH:mm
  duration: 15 | 30 | 45 | 60;
  type: "video" | "offline" | "hybrid";
  notes?: string;
}

interface GoogleCalendarProps {
  events: CalendarEvent[];
  loading?: boolean;
  onMonthChange?: (year: number, month: number) => void;
  /** Extra detail lines rendered inside event detail panel */
  renderEventExtra?: (event: CalendarEvent) => React.ReactNode;
  /** Enable booking mode — shows "Book Interview" button on future dates */
  bookingEnabled?: boolean;
  /** Callback when user submits a booking */
  onBookInterview?: (payload: BookingPayload) => Promise<void>;
  /** Fetch eligible candidates for booking (applications with interview-ready status) */
  fetchCandidates?: (search: string) => Promise<BookingCandidate[]>;
  /** Pre-fill with a specific application — skips candidate selection step */
  prefilledApplicationId?: string;
  /** Pre-filled candidate data (required when prefilledApplicationId is set) */
  prefilledCandidate?: BookingCandidate;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_COLORS: Record<string, string> = {
  video: "bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300",
  offline: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  hybrid: "bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-300",
};

const EVENT_DOT_COLORS: Record<string, string> = {
  video: "bg-sky-500",
  offline: "bg-emerald-500",
  hybrid: "bg-violet-500",
};

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isPastDate(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(d);
  check.setHours(0, 0, 0, 0);
  return check < today;
}

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month fill
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      isCurrentMonth: false,
    });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  // Next month fill to complete 6 rows
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  return cells;
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function typeIcon(type: string, className = "h-3.5 w-3.5") {
  switch (type) {
    case "video":
      return <Video className={`${className} text-sky-500`} />;
    case "offline":
      return <MapPin className={`${className} text-emerald-500`} />;
    default:
      return <Phone className={`${className} text-violet-500`} />;
  }
}

/* ================================================================== */
/*  Mini Calendar (sidebar)                                            */
/* ================================================================== */

function MiniCalendar({
  currentDate,
  selectedDate,
  onSelect,
  events,
}: {
  currentDate: Date;
  selectedDate: Date;
  onSelect: (d: Date) => void;
  events: CalendarEvent[];
}) {
  const [miniDate, setMiniDate] = useState(
    new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
  );

  useEffect(() => {
    setMiniDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate]);

  const year = miniDate.getFullYear();
  const month = miniDate.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const today = new Date();

  const hasEvents = useCallback(
    (d: Date) => events.some((e) => isSameDay(new Date(e.scheduledAt), d)),
    [events],
  );

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {MONTHS_SHORT[month]} {year}
        </span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setMiniDate(new Date(year, month - 1, 1))}
            className="rounded p-0.5 hover:bg-muted"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setMiniDate(new Date(year, month + 1, 1))}
            className="rounded p-0.5 hover:bg-muted"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="flex h-6 w-6 items-center justify-center text-[10px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {grid.map(({ date, isCurrentMonth }, i) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const hasEvt = hasEvents(date);
          const isPast = isPastDate(date) && !isToday;

          return (
            <button
              key={i}
              onClick={() => !isPast && onSelect(date)}
              disabled={isPast}
              className={`relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] transition-colors disabled:pointer-events-none ${
                isPast
                  ? "text-muted-foreground/30"
                  : !isCurrentMonth
                    ? "text-muted-foreground/40"
                    : isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                        ? "bg-primary/15 text-primary font-bold"
                        : "text-foreground hover:bg-muted"
              }`}
            >
              {date.getDate()}
              {hasEvt && !isSelected && !isPast && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Event Detail Panel                                                 */
/* ================================================================== */

function EventDetail({
  event,
  onClose,
  renderExtra,
}: {
  event: CalendarEvent;
  onClose: () => void;
  renderExtra?: (e: CalendarEvent) => React.ReactNode;
}) {
  const dt = new Date(event.scheduledAt);
  const endTime = event.duration
    ? new Date(dt.getTime() + event.duration * 60000)
    : null;

  return (
    <div className="workspace-glass-panel animate-in fade-in-0 zoom-in-95 rounded-2xl border p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`h-3 w-3 rounded-full ${EVENT_DOT_COLORS[event.type] ?? "bg-primary"}`}
          />
          <span className="text-sm font-semibold text-foreground">
            {event.title}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 hover:bg-muted"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="mt-3 space-y-2 pl-5">
        {event.subtitle && (
          <p className="text-xs text-muted-foreground">{event.subtitle}</p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 flex-shrink-0" />
          {dt.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}{" "}
          · {formatTime(dt)}
          {endTime ? ` – ${formatTime(endTime)}` : ""}
          {event.duration ? ` (${event.duration} min)` : ""}
        </p>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {typeIcon(event.type, "h-3 w-3 flex-shrink-0")}
          {event.type === "video"
            ? "Video Call"
            : event.type === "offline"
              ? "In Person"
              : "Hybrid"}
        </p>

        {event.location && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            {event.location}
          </p>
        )}

        {event.meetLink && (
          <a
            href={event.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <Video className="h-3 w-3" />
            Join Meeting
          </a>
        )}

        {renderExtra?.(event)}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Month View                                                         */
/* ================================================================== */

function MonthView({
  currentDate,
  selectedDate,
  events,
  onSelectDate,
  onSelectEvent,
}: {
  currentDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const key = new Date(e.scheduledAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    // Sort each day's events by time
    map.forEach((dayEvents) =>
      dayEvents.sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    );
    return map;
  }, [events]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-border/50">
        {WEEKDAYS_SHORT.map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1">
        {grid.map(({ date, isCurrentMonth }, i) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const isPast = isPastDate(date) && !isToday;
          const dayEvents = eventsByDay.get(date.toDateString()) ?? [];
          const row = Math.floor(i / 7);
          const isLastRow = row === 5;

          return (
            <button
              key={i}
              onClick={() => !isPast && onSelectDate(date)}
              disabled={isPast}
              className={`group relative min-h-[100px] border-b border-r border-border/30 p-1.5 text-left transition-colors disabled:pointer-events-none ${
                isPast ? "bg-muted/5 cursor-default" : "hover:bg-muted/30"
              } ${!isCurrentMonth ? "bg-muted/10" : ""} ${
                isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""
              } ${isLastRow ? "border-b-0" : ""} ${
                (i + 1) % 7 === 0 ? "border-r-0" : ""
              }`}
            >
              {/* Day number */}
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : isPast
                        ? "text-muted-foreground/40"
                        : !isCurrentMonth
                          ? "text-muted-foreground/50"
                          : "text-foreground group-hover:bg-muted"
                  }`}
                >
                  {date.getDate()}
                </span>
              </div>

              {/* Events */}
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e._id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectEvent(e);
                    }}
                    className={`flex cursor-pointer items-center gap-1 rounded-md border-l-2 px-1.5 py-0.5 text-[10px] font-medium leading-tight transition-opacity hover:opacity-80 ${
                      isPast ? "opacity-60" : ""
                    } ${EVENT_COLORS[e.type] ?? "bg-primary/10 border-primary/40 text-primary"}`}
                  >
                    <span className="truncate">
                      {formatTime(new Date(e.scheduledAt)).replace(/\s?(AM|PM)/, "").trim()}{" "}
                      {e.title}
                    </span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[10px] font-medium text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Week / Day View (Time Grid)                                        */
/* ================================================================== */

function TimeGridView({
  dates,
  events,
  selectedDate,
  onSelectDate,
  onSelectEvent,
}: {
  dates: Date[];
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const isMultiDay = dates.length > 1;

  // Scroll to 8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * 60; // 8AM * 60px per hour
    }
  }, [dates]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    dates.forEach((d) => map.set(d.toDateString(), []));
    events.forEach((e) => {
      const key = new Date(e.scheduledAt).toDateString();
      if (map.has(key)) map.get(key)!.push(e);
    });
    return map;
  }, [events, dates]);

  // Current time indicator position
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  return (
    <div className="flex flex-col overflow-hidden">
      {/* All-day header */}
      {isMultiDay && (
        <div className="flex border-b border-border/50">
          {/* Time gutter */}
          <div className="w-16 flex-shrink-0" />
          {/* Day columns */}
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}>
            {dates.map((d, i) => {
              const isToday = isSameDay(d, today);
              const isSelected = isSameDay(d, selectedDate);
              return (
                <button
                  key={i}
                  onClick={() => onSelectDate(d)}
                  className={`flex flex-col items-center border-r border-border/30 py-2.5 transition-colors hover:bg-muted/30 last:border-r-0 ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {WEEKDAYS_SHORT[d.getDay()]}
                  </span>
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Single day header */}
      {!isMultiDay && dates[0] && (
        <div className="border-b border-border/50 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {WEEKDAYS_FULL[dates[0].getDay()]},{" "}
            {MONTHS[dates[0].getMonth()]} {dates[0].getDate()}
          </p>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="relative flex" style={{ minHeight: `${24 * 60}px` }}>
          {/* Time labels */}
          <div className="sticky left-0 z-10 w-16 flex-shrink-0 bg-background">
            {HOURS.map((h) => (
              <div
                key={h}
                className="relative flex items-start justify-end pr-2"
                style={{ height: "60px" }}
              >
                <span className="text-[10px] font-medium text-muted-foreground -mt-1.5">
                  {h === 0 ? "" : formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns with events */}
          <div
            className="relative grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${dates.length}, 1fr)`,
            }}
          >
            {dates.map((d, colIdx) => {
              const dayEvents = eventsByDay.get(d.toDateString()) ?? [];
              const isToday = isSameDay(d, today);

              return (
                <div
                  key={colIdx}
                  className="relative border-r border-border/30 last:border-r-0"
                >
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="border-b border-border/20"
                      style={{ height: "60px" }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center"
                      style={{ top: `${nowMinutes}px` }}
                    >
                      <div className="h-2.5 w-2.5 -ml-1 rounded-full bg-red-500" />
                      <div className="h-[2px] flex-1 bg-red-500" />
                    </div>
                  )}

                  {/* Events */}
                  {dayEvents.map((evt) => {
                    const evtDate = new Date(evt.scheduledAt);
                    const topMin =
                      evtDate.getHours() * 60 + evtDate.getMinutes();
                    const heightMin = Math.max(evt.duration ?? 30, 20);

                    return (
                      <button
                        key={evt._id}
                        onClick={() => onSelectEvent(evt)}
                        className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-all hover:shadow-md hover:z-30 ${
                          EVENT_COLORS[evt.type] ??
                          "bg-primary/10 border-primary/40 text-primary"
                        }`}
                        style={{
                          top: `${topMin}px`,
                          height: `${Math.max(heightMin, 24)}px`,
                          minHeight: "24px",
                        }}
                      >
                        <p className="truncate text-[11px] font-semibold leading-tight">
                          {evt.title}
                        </p>
                        {heightMin >= 40 && (
                          <p className="truncate text-[10px] opacity-75 leading-tight mt-0.5">
                            {formatTime(evtDate)}
                            {evt.subtitle ? ` · ${evt.subtitle}` : ""}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Upcoming Events List                                               */
/* ================================================================== */

function UpcomingList({
  events,
  selectedDate,
  onSelect,
}: {
  events: CalendarEvent[];
  selectedDate: Date;
  onSelect: (e: CalendarEvent) => void;
}) {
  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => isSameDay(new Date(e.scheduledAt), selectedDate))
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() -
            new Date(b.scheduledAt).getTime(),
        ),
    [events, selectedDate],
  );

  const upcoming = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.scheduledAt) >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      )
      .slice(0, 5);
  }, [events]);

  return (
    <div className="space-y-5">
      {/* Selected day events */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          {selectedDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </h3>
        {dayEvents.length === 0 ? (
          <p className="rounded-xl bg-muted/30 py-6 text-center text-xs text-muted-foreground">
            No events
          </p>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <button
                key={e._id}
                onClick={() => onSelect(e)}
                className={`w-full rounded-xl border-l-[3px] p-3 text-left transition-colors hover:bg-muted/40 ${
                  EVENT_COLORS[e.type] ??
                  "bg-primary/5 border-primary/40 text-primary"
                }`}
              >
                <div className="flex items-center gap-2">
                  {typeIcon(e.type)}
                  <span className="text-xs font-semibold">{e.title}</span>
                </div>
                <p className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                  <Clock className="h-2.5 w-2.5" />
                  {formatTime(new Date(e.scheduledAt))}
                  {e.duration ? ` · ${e.duration} min` : ""}
                </p>
                {e.subtitle && (
                  <p className="mt-0.5 truncate text-[10px] opacity-60">
                    {e.subtitle}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Upcoming
          </h3>
          <div className="space-y-1.5">
            {upcoming.map((e) => {
              const dt = new Date(e.scheduledAt);
              return (
                <button
                  key={e._id}
                  onClick={() => onSelect(e)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      EVENT_DOT_COLORS[e.type] ?? "bg-primary"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {e.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {dt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {formatTime(dt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Booking Modal                                                      */
/* ================================================================== */

function BookingModal({
  date,
  events,
  onClose,
  onSubmit,
  fetchCandidates,
  prefilledCandidate,
}: {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onSubmit: (payload: BookingPayload) => Promise<void>;
  fetchCandidates?: (search: string) => Promise<BookingCandidate[]>;
  prefilledCandidate?: BookingCandidate;
}) {
  // Step: "candidate" → "details" → "confirmation"
  const initialStep = prefilledCandidate
    ? "details"
    : fetchCandidates
      ? "candidate"
      : "details";
  const [step, setStep] = useState<"candidate" | "details" | "confirmation">(
    initialStep,
  );
  const [selectedCandidate, setSelectedCandidate] =
    useState<BookingCandidate | null>(prefilledCandidate ?? null);

  // Candidate search state
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<BookingCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Details state
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [type, setType] = useState<"video" | "offline" | "hybrid">("video");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isToday = isSameDay(date, new Date());
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Debounced candidate search
  useEffect(() => {
    if (!fetchCandidates || step !== "candidate") return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await fetchCandidates(searchQuery);
        setCandidates(results);
      } catch {
        setCandidates([]);
      } finally {
        setSearchLoading(false);
        setSearchDone(true);
      }
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, fetchCandidates, step]);

  // Generate time slots (30 min intervals)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const totalMin = h * 60 + m;
        if (isToday && totalMin <= currentMinutes + 30) continue;
        slots.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }
    return slots;
  }, [isToday, currentMinutes]);

  // Check for conflicts
  const conflicts = useMemo(() => {
    const reqStart = new Date(date);
    const [h, m] = time.split(":").map(Number);
    reqStart.setHours(h, m, 0, 0);
    const reqEnd = new Date(reqStart.getTime() + duration * 60000);

    return events.filter((e) => {
      const eStart = new Date(e.scheduledAt);
      const eEnd = new Date(eStart.getTime() + (e.duration ?? 30) * 60000);
      return eStart < reqEnd && eEnd > reqStart;
    });
  }, [date, time, duration, events]);

  // Set default time to first available slot
  useEffect(() => {
    if (timeSlots.length > 0 && !timeSlots.includes(time)) {
      setTime(timeSlots[0]);
    }
  }, [timeSlots, time]);

  const handleGoToConfirmation = () => {
    if (!selectedCandidate && fetchCandidates) {
      setError("Please select a candidate first");
      return;
    }
    if (conflicts.length > 0) {
      setError("This time conflicts with an existing interview");
      return;
    }
    setError("");
    setStep("confirmation");
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      await onSubmit({
        applicationId: selectedCandidate?.applicationId ?? "",
        date: date.toISOString().split("T")[0],
        time,
        duration,
        type,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book interview");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTimeLabel = (() => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  })();

  const endTimeLabel = (() => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + duration);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="animate-in fade-in-0 zoom-in-95 w-full max-w-md rounded-2xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            {step === "details" && fetchCandidates && !prefilledCandidate && (
              <button
                onClick={() => setStep("candidate")}
                className="rounded-lg p-1 hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {step === "confirmation" && (
              <button
                onClick={() => setStep("details")}
                className="rounded-lg p-1 hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <h3 className="text-base font-semibold text-foreground">
              {step === "candidate"
                ? "Select Candidate"
                : step === "details"
                  ? "Interview Details"
                  : "Confirm Booking"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Step 1: Candidate Selection ── */}
        {step === "candidate" && (
          <div className="p-5">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates by name or job title..."
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>

            {/* Results */}
            <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto">
              {searchLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}

              {!searchLoading && searchDone && candidates.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {searchQuery
                    ? "No candidates found"
                    : "No eligible candidates (shortlisted or applied)"}
                </p>
              )}

              {!searchLoading &&
                candidates.map((c) => (
                  <button
                    key={c.applicationId}
                    onClick={() => {
                      setSelectedCandidate(c);
                      setStep("details");
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40 ${
                      selectedCandidate?.applicationId === c.applicationId
                        ? "border-primary bg-primary/5"
                        : "border-border/50"
                    }`}
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {c.candidateName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Briefcase className="h-3 w-3 flex-shrink-0" />
                        {c.jobTitle}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-block rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                          {c.status.replace(/_/g, " ")}
                        </span>
                        {c.matchScore != null && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              c.matchScore >= 80
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : c.matchScore >= 50
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-red-500/15 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {c.matchScore}% match
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Interview Details ── */}
        {step === "details" && (
          <div className="space-y-4 p-5">
            {/* Selected candidate chip */}
            {selectedCandidate && (
              <div className="flex items-center gap-2.5 rounded-xl bg-primary/5 border border-primary/20 p-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">
                    {selectedCandidate.candidateName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {selectedCandidate.jobTitle}
                  </p>
                </div>
                {fetchCandidates && (
                  <button
                    onClick={() => setStep("candidate")}
                    className="text-[10px] font-medium text-primary hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            {/* Date display */}
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Date</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {date.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* Time selection */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Time
              </label>
              {timeSlots.length === 0 ? (
                <p className="text-xs text-destructive">
                  No available time slots for today
                </p>
              ) : (
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {timeSlots.map((slot) => {
                    const [sh, sm] = slot.split(":").map(Number);
                    const d = new Date();
                    d.setHours(sh, sm);
                    return (
                      <option key={slot} value={slot}>
                        {d.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Duration
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([15, 30, 45, 60] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      duration === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["video", "offline", "hybrid"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                      type === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {t === "video" ? (
                      <Video className="h-3 w-3" />
                    ) : t === "offline" ? (
                      <MapPin className="h-3 w-3" />
                    ) : (
                      <Phone className="h-3 w-3" />
                    )}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Any instructions for the candidate..."
              />
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </p>
              <p className="mt-1 text-xs text-foreground">
                {selectedCandidate
                  ? `${selectedCandidate.candidateName} · `
                  : ""}
                {selectedTimeLabel} – {endTimeLabel} · {duration} min · {type}
              </p>
            </div>

            {/* Conflict warning */}
            {conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-destructive">
                    Time conflict detected
                  </p>
                  <p className="mt-0.5 text-[10px] text-destructive/70">
                    {conflicts.map((c) => c.title).join(", ")} already scheduled
                    at this time
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && <p className="text-xs text-destructive">{error}</p>}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={
                  conflicts.length > 0 ||
                  timeSlots.length === 0 ||
                  (!!fetchCandidates && !selectedCandidate)
                }
                onClick={handleGoToConfirmation}
              >
                Review & Confirm
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirmation ── */}
        {step === "confirmation" && (
          <div className="space-y-4 p-5">
            {/* Candidate */}
            {selectedCandidate && (
              <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {selectedCandidate.candidateName}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3 flex-shrink-0" />
                    {selectedCandidate.jobTitle}
                  </p>
                </div>
                {selectedCandidate.matchScore != null && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selectedCandidate.matchScore >= 80
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : selectedCandidate.matchScore >= 50
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-red-500/15 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {selectedCandidate.matchScore}% match
                  </span>
                )}
              </div>
            )}

            {/* Details summary */}
            <div className="space-y-2.5 rounded-xl bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Date</span>
                <span className="text-xs font-semibold text-foreground">
                  {date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Time</span>
                <span className="text-xs font-semibold text-foreground">
                  {selectedTimeLabel} – {endTimeLabel}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Duration</span>
                <span className="text-xs font-semibold text-foreground">
                  {duration} minutes
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Type</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold capitalize text-foreground">
                  {type === "video" ? (
                    <Video className="h-3 w-3 text-sky-500" />
                  ) : type === "offline" ? (
                    <MapPin className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Phone className="h-3 w-3 text-violet-500" />
                  )}
                  {type === "video"
                    ? "Video Call"
                    : type === "offline"
                      ? "In Person"
                      : "Hybrid"}
                </span>
              </div>
              {notes.trim() && (
                <>
                  <div className="h-px bg-border/50" />
                  <div>
                    <span className="text-xs text-muted-foreground">Notes</span>
                    <p className="mt-1 text-xs text-foreground">
                      {notes.trim()}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Error */}
            {error && <p className="text-xs text-destructive">{error}</p>}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setStep("details")}
              >
                Back
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Booking..." : "Confirm & Book"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function GoogleCalendar({
  events,
  loading,
  onMonthChange,
  renderEventExtra,
  bookingEnabled,
  onBookInterview,
  fetchCandidates,
  prefilledApplicationId,
  prefilledCandidate,
}: GoogleCalendarProps) {
  const [view, setView] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [showBooking, setShowBooking] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navigation
  const navigate = useCallback(
    (dir: -1 | 1) => {
      setSelectedEvent(null);
      if (view === "month") {
        const nd = new Date(year, month + dir, 1);
        setCurrentDate(nd);
        onMonthChange?.(nd.getFullYear(), nd.getMonth());
      } else if (view === "week") {
        const nd = new Date(currentDate);
        nd.setDate(nd.getDate() + dir * 7);
        setCurrentDate(nd);
        if (nd.getMonth() !== month) {
          onMonthChange?.(nd.getFullYear(), nd.getMonth());
        }
      } else {
        const nd = new Date(currentDate);
        nd.setDate(nd.getDate() + dir);
        setCurrentDate(nd);
        if (nd.getMonth() !== month) {
          onMonthChange?.(nd.getFullYear(), nd.getMonth());
        }
      }
    },
    [view, year, month, currentDate, onMonthChange],
  );

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
    setSelectedEvent(null);
    onMonthChange?.(now.getFullYear(), now.getMonth());
  }, [onMonthChange]);

  const handleSelectDate = useCallback((d: Date) => {
    setSelectedDate(d);
    setSelectedEvent(null);
  }, []);

  const handleSelectEvent = useCallback((e: CalendarEvent) => {
    setSelectedEvent(e);
    setSelectedDate(new Date(e.scheduledAt));
  }, []);

  // Week dates for week view
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  // Header title
  const headerTitle = useMemo(() => {
    if (view === "month") return `${MONTHS[month]} ${year}`;
    if (view === "week") {
      const start = weekDates[0];
      const end = weekDates[6];
      if (start.getMonth() === end.getMonth()) {
        return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return currentDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [view, month, year, weekDates, currentDate]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            {headerTitle}
          </h2>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2">
          {bookingEnabled && onBookInterview && !isPastDate(selectedDate) && (
            <Button
              size="sm"
              onClick={() => setShowBooking(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Book Interview</span>
            </Button>
          )}
          <div className="flex items-center rounded-xl border border-border/50 bg-muted/30 p-0.5">
          {(
            [
              { key: "day", icon: List, label: "Day" },
              { key: "week", icon: CalendarDays, label: "Week" },
              { key: "month", icon: LayoutGrid, label: "Month" },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all ${
                view === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        {/* Calendar Area */}
        <div className="workspace-panel-surface overflow-hidden rounded-[20px]">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : view === "month" ? (
            <MonthView
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={events}
              onSelectDate={handleSelectDate}
              onSelectEvent={handleSelectEvent}
            />
          ) : (
            <TimeGridView
              dates={view === "week" ? weekDates : [currentDate]}
              events={events}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onSelectEvent={handleSelectEvent}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Mini calendar */}
          <div className="workspace-panel-surface rounded-[20px] p-4">
            <MiniCalendar
              currentDate={currentDate}
              selectedDate={selectedDate}
              onSelect={(d) => {
                handleSelectDate(d);
                setCurrentDate(d);
                if (d.getMonth() !== month || d.getFullYear() !== year) {
                  onMonthChange?.(d.getFullYear(), d.getMonth());
                }
              }}
              events={events}
            />
          </div>

          {/* Event detail or upcoming list */}
          <div className="workspace-panel-surface rounded-[20px] p-4">
            {selectedEvent ? (
              <EventDetail
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                renderExtra={renderEventExtra}
              />
            ) : (
              <UpcomingList
                events={events}
                selectedDate={selectedDate}
                onSelect={handleSelectEvent}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Booking Modal ── */}
      {showBooking && bookingEnabled && onBookInterview && (
        <BookingModal
          date={selectedDate}
          events={events}
          onClose={() => setShowBooking(false)}
          onSubmit={onBookInterview}
          fetchCandidates={prefilledCandidate ? undefined : fetchCandidates}
          prefilledCandidate={prefilledCandidate}
        />
      )}
    </div>
  );
}
