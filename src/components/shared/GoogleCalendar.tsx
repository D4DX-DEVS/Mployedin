"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
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

const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;
const MONTH_SHORT_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;
const WEEKDAY_SHORT_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_MINI_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_FULL_KEYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_COLORS: Record<string, string> = {
  video: "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300 backdrop-blur-sm",
  offline: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 backdrop-blur-sm",
  hybrid: "bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-300 backdrop-blur-sm",
};

const EVENT_DOT_COLORS: Record<string, string> = {
  video: "bg-sky-500 shadow-sky-500/40 shadow-sm",
  offline: "bg-emerald-500 shadow-emerald-500/40 shadow-sm",
  hybrid: "bg-violet-500 shadow-violet-500/40 shadow-sm",
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

function formatTime(date: Date, locale: string) {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatHour(hour: number, locale: string) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(locale, { hour: "numeric", hour12: true });
}

function formatDateLocale(date: Date, locale: string, opts: Intl.DateTimeFormatOptions) {
  return date.toLocaleDateString(locale, opts);
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
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isRtl = locale === "ar";
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

  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="select-none" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-foreground">
          {t(`monthsShort.${MONTH_SHORT_KEYS[month]}`)} {year}
        </span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setMiniDate(new Date(year, month - 1, 1))}
            className="rounded-lg p-1 hover:bg-muted transition-colors"
            aria-label={t(`months.${MONTH_KEYS[(month + 11) % 12]}`)}
          >
            <PrevIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setMiniDate(new Date(year, month + 1, 1))}
            className="rounded-lg p-1 hover:bg-muted transition-colors"
            aria-label={t(`months.${MONTH_KEYS[(month + 1) % 12]}`)}
          >
            <NextIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={t(`months.${MONTH_KEYS[month]}`)}>
        {WEEKDAY_MINI_KEYS.map((key, i) => (
          <div
            key={i}
            role="columnheader"
            className="flex h-7 w-7 items-center justify-center text-[10px] font-semibold text-muted-foreground/70"
          >
            {t(`weekdaysMini.${key}`)}
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
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={formatDateLocale(date, locale, { month: "long", day: "numeric" })}
              className={`relative flex h-7 w-7 items-center justify-center rounded-lg text-[11px] transition-all duration-150 disabled:pointer-events-none ${
                isPast
                  ? "text-muted-foreground/25"
                  : !isCurrentMonth
                    ? "text-muted-foreground/35"
                    : isSelected
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : isToday
                        ? "bg-primary/12 text-primary font-bold ring-1 ring-primary/20"
                        : "text-foreground hover:bg-muted/60"
              }`}
            >
              {date.getDate()}
              {hasEvt && !isSelected && !isPast && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary/70" />
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
  const t = useTranslations("calendar");
  const locale = useLocale();
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
          aria-label={t("cancel")}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="mt-3 space-y-2 ps-5">
        {event.subtitle && (
          <p className="text-xs text-muted-foreground">{event.subtitle}</p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 flex-shrink-0" />
          {formatDateLocale(dt, locale, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}{" "}
          · {formatTime(dt, locale)}
          {endTime ? ` – ${formatTime(endTime, locale)}` : ""}
          {event.duration ? ` (${t("min", { count: event.duration })})` : ""}
        </p>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {typeIcon(event.type, "h-3 w-3 flex-shrink-0")}
          {event.type === "video"
            ? t("videoCall")
            : event.type === "offline"
              ? t("inPerson")
              : t("hybrid")}
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
            className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-all duration-150 hover:shadow-sm"
          >
            <Video className="h-3.5 w-3.5" />
            {t("joinMeeting")}
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
  const t = useTranslations("calendar");
  const locale = useLocale();
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
      <div className="grid grid-cols-7 border-b border-border/50" role="row">
        {WEEKDAY_SHORT_KEYS.map((key) => (
          <div
            key={key}
            role="columnheader"
            className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {t(`weekdaysShort.${key}`)}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1" role="grid" aria-label={t(`months.${MONTH_KEYS[month]}`)}>
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
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={formatDateLocale(date, locale, { month: "long", day: "numeric", weekday: "long" })}
              className={`group relative min-h-[100px] border-b border-e border-border/20 p-1.5 text-start transition-all duration-150 disabled:pointer-events-none ${
                isPast ? "bg-muted/5 cursor-default" : "hover:bg-muted/20 hover:shadow-inner"
              } ${!isCurrentMonth ? "bg-muted/8" : ""} ${
                isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/25 shadow-inner shadow-primary/5" : ""
              } ${isLastRow ? "border-b-0" : ""} ${
                (i + 1) % 7 === 0 ? "border-e-0" : ""
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
                    className={`flex cursor-pointer items-center gap-1 rounded-lg border-s-2 px-1.5 py-0.5 text-[10px] font-medium leading-tight transition-all duration-150 hover:opacity-90 hover:shadow-sm hover:translate-x-0.5 ${
                      isPast ? "opacity-50" : ""
                    } ${EVENT_COLORS[e.type] ?? "bg-primary/10 border-primary/40 text-primary"}`}
                  >
                    <span className="truncate">
                      {formatTime(new Date(e.scheduledAt), locale).replace(/\s?(AM|PM|ص|م)/, "").trim()}{" "}
                      {e.title}
                    </span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[10px] font-medium text-muted-foreground">
                    {t("more", { count: dayEvents.length - 3 })}
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
  const t = useTranslations("calendar");
  const locale = useLocale();
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
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  className={`flex flex-col items-center border-e border-border/30 py-3 transition-all duration-150 hover:bg-muted/30 last:border-e-0 ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(`weekdaysShort.${WEEKDAY_SHORT_KEYS[d.getDay()]}`)}
                  </span>
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isToday
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
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
            {t(`weekdaysFull.${WEEKDAY_FULL_KEYS[dates[0].getDay()]}`)},{" "}
            {t(`months.${MONTH_KEYS[dates[0].getMonth()]}`)} {dates[0].getDate()}
          </p>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="relative flex" style={{ minHeight: `${24 * 60}px` }}>
          {/* Time labels */}
          <div className="sticky start-0 z-10 w-16 flex-shrink-0 bg-background">
            {HOURS.map((h) => (
              <div
                key={h}
                className="relative flex items-start justify-end pe-2"
                style={{ height: "60px" }}
              >
                <span className="text-[10px] font-medium text-muted-foreground -mt-1.5">
                  {h === 0 ? "" : formatHour(h, locale)}
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
                  className="relative border-e border-border/30 last:border-e-0"
                >
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="border-b border-border/15 hover:bg-muted/20 transition-colors"
                      style={{ height: "60px" }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (
                    <div
                      className="absolute inset-x-0 z-20 flex items-center"
                      style={{ top: `${nowMinutes}px` }}
                    >
                      <div className="h-3 w-3 -ms-1.5 rounded-full bg-red-500 shadow-md shadow-red-500/30 ring-2 ring-red-500/20" />
                      <div className="h-[2px] flex-1 bg-gradient-to-r from-red-500 to-red-500/0" />
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
                        className={`absolute inset-x-1 z-10 overflow-hidden rounded-xl border-s-[3px] px-2.5 py-1.5 text-start transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:z-30 active:scale-[0.98] ${
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
                            {formatTime(evtDate, locale)}
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
  const t = useTranslations("calendar");
  const locale = useLocale();
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
          {formatDateLocale(selectedDate, locale, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </h3>
        {dayEvents.length === 0 ? (
          <p className="rounded-xl bg-muted/20 border border-dashed border-border/40 py-8 text-center text-xs text-muted-foreground">
            <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            {t("noEvents")}
          </p>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <button
                key={e._id}
                onClick={() => onSelect(e)}
                className={`w-full rounded-xl border-s-[3px] p-3 text-start transition-colors hover:bg-muted/40 ${
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
                  {formatTime(new Date(e.scheduledAt), locale)}
                  {e.duration ? ` · ${t("min", { count: e.duration })}` : ""}
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
            {t("upcoming")}
          </h3>
          <div className="space-y-1.5">
            {upcoming.map((e) => {
              const dt = new Date(e.scheduledAt);
              return (
                <button
                  key={e._id}
                  onClick={() => onSelect(e)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-muted/40"
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
                      {formatDateLocale(dt, locale, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {formatTime(dt, locale)}
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
  const t = useTranslations("calendar");
  const locale = useLocale();
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
      setError(t("selectCandidate"));
      return;
    }
    if (conflicts.length > 0) {
      setError(t("conflictTitle"));
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
      setError(err instanceof Error ? err.message : t("failedBook"));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTimeLabel = (() => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
  })();

  const endTimeLabel = (() => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + duration);
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300 w-full max-w-md rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
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
                ? t("selectCandidate")
                : step === "details"
                  ? t("interviewDetails")
                  : t("confirmBooking")}
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
                placeholder={t("searchCandidates")}
                className="w-full rounded-lg border bg-background py-2.5 ps-9 pe-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>

            {/* Results */}
            <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto">
              {searchLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <span className="text-[10px] text-muted-foreground">{t("searchCandidates")}...</span>
                </div>
              )}

              {!searchLoading && searchDone && candidates.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {searchQuery
                    ? t("noCandidatesFound")
                    : t("noCandidatesEligible")}
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
                            {t("match", { score: c.matchScore })}
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
                    {t("change")}
                  </button>
                )}
              </div>
            )}

            {/* Date display */}
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("date")}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {formatDateLocale(date, locale, {
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
                {t("timeLabel")}
              </label>
              {timeSlots.length === 0 ? (
                <p className="text-xs text-destructive">
                  {t("noTimeSlots")}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-[140px] overflow-y-auto rounded-xl border border-border/50 bg-muted/20 p-2">
                  {timeSlots.map((slot) => {
                    const [sh, sm] = slot.split(":").map(Number);
                    const d = new Date();
                    d.setHours(sh, sm);
                    const label = d.toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });
                    const isActive = time === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTime(slot)}
                        className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                            : "bg-background hover:bg-muted text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("duration")}
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
                    {t("min", { count: d })}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("type")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["video", "offline", "hybrid"] as const).map((tp) => (
                  <button
                    key={tp}
                    onClick={() => setType(tp)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      type === tp
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {tp === "video" ? (
                      <Video className="h-3 w-3" />
                    ) : tp === "offline" ? (
                      <MapPin className="h-3 w-3" />
                    ) : (
                      <Phone className="h-3 w-3" />
                    )}
                    {tp === "video" ? t("videoCall") : tp === "offline" ? t("inPerson") : t("hybrid")}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("notes")} ({t("optional")})
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={t("notesPlaceholder")}
              />
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("summary")}
              </p>
              <p className="mt-1 text-xs text-foreground">
                {selectedCandidate
                  ? `${selectedCandidate.candidateName} · `
                  : ""}
                {selectedTimeLabel} – {endTimeLabel} · {t("min", { count: duration })} · {type === "video" ? t("videoCall") : type === "offline" ? t("inPerson") : t("hybrid")}
              </p>
            </div>

            {/* Conflict warning */}
            {conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-destructive">
                    {t("conflictTitle")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-destructive/70">
                    {t("conflictDesc", { titles: conflicts.map((c) => c.title).join(", ") })}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl"
                onClick={onClose}
              >
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                className="flex-1 rounded-xl shadow-sm shadow-primary/20"
                disabled={
                  conflicts.length > 0 ||
                  timeSlots.length === 0 ||
                  (!!fetchCandidates && !selectedCandidate)
                }
                onClick={handleGoToConfirmation}
              >
                {t("reviewConfirm")}
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
                    {t("match", { score: selectedCandidate.matchScore })}
                  </span>
                )}
              </div>
            )}

            {/* Details summary */}
            <div className="space-y-2.5 rounded-xl bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("date")}</span>
                <span className="text-xs font-semibold text-foreground">
                  {formatDateLocale(date, locale, {
                    weekday: "short",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("timeLabel")}</span>
                <span className="text-xs font-semibold text-foreground">
                  {selectedTimeLabel} – {endTimeLabel}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("duration")}</span>
                <span className="text-xs font-semibold text-foreground">
                  {t("minutes", { count: duration })}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("type")}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {type === "video" ? (
                    <Video className="h-3 w-3 text-sky-500" />
                  ) : type === "offline" ? (
                    <MapPin className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Phone className="h-3 w-3 text-violet-500" />
                  )}
                  {type === "video"
                    ? t("videoCall")
                    : type === "offline"
                      ? t("inPerson")
                      : t("hybrid")}
                </span>
              </div>
              {notes.trim() && (
                <>
                  <div className="h-px bg-border/50" />
                  <div>
                    <span className="text-xs text-muted-foreground">{t("notes")}</span>
                    <p className="mt-1 text-xs text-foreground">
                      {notes.trim()}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl"
                onClick={() => setStep("details")}
              >
                {t("back")}
              </Button>
              <Button
                size="sm"
                className="flex-1 rounded-xl shadow-sm shadow-primary/20"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? t("booking") : t("confirmBook")}
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
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isRtl = locale === "ar";
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
    if (view === "month") return `${t(`months.${MONTH_KEYS[month]}`)} ${year}`;
    if (view === "week") {
      const start = weekDates[0];
      const end = weekDates[6];
      if (start.getMonth() === end.getMonth()) {
        return `${t(`months.${MONTH_KEYS[start.getMonth()]}`)} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${t(`monthsShort.${MONTH_SHORT_KEYS[start.getMonth()]}`)} ${start.getDate()} – ${t(`monthsShort.${MONTH_SHORT_KEYS[end.getMonth()]}`)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return formatDateLocale(currentDate, locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [view, month, year, weekDates, currentDate, t, locale]);

  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-5" dir={isRtl ? "rtl" : "ltr"}>
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={goToToday} className="rounded-xl font-semibold">
            {t("today")}
          </Button>
          <div className="flex items-center gap-0.5 rounded-xl border border-border/40 bg-muted/20 p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={() => navigate(-1)}
              aria-label={view === "month" ? t(`months.${MONTH_KEYS[(month + 11) % 12]}`) : undefined}
            >
              <PrevIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={() => navigate(1)}
              aria-label={view === "month" ? t(`months.${MONTH_KEYS[(month + 1) % 12]}`) : undefined}
            >
              <NextIcon className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {headerTitle}
          </h2>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2.5">
          {bookingEnabled && onBookInterview && !isPastDate(selectedDate) && (
            <Button
              size="sm"
              onClick={() => setShowBooking(true)}
              className="gap-1.5 rounded-xl shadow-sm shadow-primary/20"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("bookInterview")}</span>
            </Button>
          )}
          <div className="flex items-center rounded-xl border border-border/40 bg-muted/20 p-0.5">
          {(
            [
              { key: "day", icon: List, labelKey: "dayView" },
              { key: "week", icon: CalendarDays, labelKey: "weekView" },
              { key: "month", icon: LayoutGrid, labelKey: "monthView" },
            ] as const
          ).map(({ key, icon: Icon, labelKey }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                view === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
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
            <div className="animate-in fade-in-50 duration-500 p-4 space-y-3">
              {/* Skeleton header row */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-6 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
              {/* Skeleton grid rows */}
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, col) => (
                    <div key={col} className="h-[88px] rounded-xl bg-muted/25 animate-pulse" style={{ animationDelay: `${(row * 7 + col) * 30}ms` }} />
                  ))}
                </div>
              ))}
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
