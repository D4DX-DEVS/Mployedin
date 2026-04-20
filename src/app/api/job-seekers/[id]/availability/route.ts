import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Interview from "@/models/Interview";
import { isValidObjectId } from "mongoose";
import { addMinutes, addDays } from "date-fns";

type AuthCtx = { userId: string; role: string };

interface AvailableSlot {
  day: string;
  startTime: string;
  endTime: string;
}

/** Format a Date in a specific IANA timezone → "HH:mm" */
function toHHmm(date: Date, tz: string): string {
  return date.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Format a Date in a specific IANA timezone → "YYYY-MM-DD" */
function toDateStr(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** Get the day name in a specific timezone */
function toDayName(date: Date, tz: string): string {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIndex = new Date(
    date.toLocaleString("en-US", { timeZone: tz })
  ).getDay();
  return DAY_NAMES[dayIndex];
}

/** Create a Date from "YYYY-MM-DD" + "HH:mm" in a specific timezone */
function fromLocalTime(dateStr: string, time: string, tz: string): Date {
  // Build an ISO-ish string and use Intl to resolve the offset
  const isoGuess = `${dateStr}T${time}:00`;
  // Create date in UTC then adjust
  const utcGuess = new Date(isoGuess + "Z");
  // Get the offset for this timezone at this moment
  const localStr = utcGuess.toLocaleString("en-US", { timeZone: tz });
  const localDate = new Date(localStr);
  const offsetMs = utcGuess.getTime() - localDate.getTime();
  // The actual UTC time when it's "time" in "tz"
  const result = new Date(utcGuess.getTime() + offsetMs);
  return result;
}

/**
 * GET /api/job-seekers/[id]/availability?date=2026-04-22
 *
 * Returns the candidate's available time slots for a given date,
 * minus any already-booked interview windows + buffer.
 */
async function handler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  const seekerId = params?.id;
  if (!seekerId || !isValidObjectId(seekerId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date"); // YYYY-MM-DD
  const rangeParam = url.searchParams.get("range"); // optional: number of days (1-14)

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 });
  }

  const rangeDays = Math.min(Math.max(Number(rangeParam) || 1, 1), 14);

  await connectDB();

  const seeker = await (JobSeeker as unknown as {
    findById: (id: string) => {
      select: (s: string) => { lean: () => Promise<{
        settings?: {
          instantBooking?: boolean;
          weeklyAvailability?: string[];
          timeBuffer?: number;
          timezone?: string;
          availableHours?: AvailableSlot[];
        };
      } | null> };
    };
  }).findById(seekerId).select("settings").lean();

  if (!seeker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = seeker.settings ?? {};

  if (!settings.instantBooking) {
    return NextResponse.json({ error: "Candidate has not enabled instant booking" }, { status: 403 });
  }

  const tz = settings.timezone ?? "Asia/Dubai";
  const weeklyAvailability = settings.weeklyAvailability ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const timeBuffer = settings.timeBuffer ?? 30;
  const availableHours = settings.availableHours ?? weeklyAvailability.map((day) => ({
    day,
    startTime: "09:00",
    endTime: "17:00",
  }));

  // Build a day→hours map
  const dayHoursMap = new Map<string, { startTime: string; endTime: string }>();
  for (const slot of availableHours) {
    dayHoursMap.set(slot.day, { startTime: slot.startTime, endTime: slot.endTime });
  }

  // Use the seeker's timezone to compute date boundaries
  const startDate = fromLocalTime(dateParam, "00:00", tz);
  const endDate = fromLocalTime(
    toDateStr(addDays(startDate, rangeDays), tz),
    "00:00",
    tz,
  );

  // Fetch existing interviews for the date range (UTC boundaries)
  const existingInterviews = await Interview.find({
    jobSeekerId: seekerId,
    scheduledAt: { $gte: startDate, $lt: endDate },
    status: { $in: ["scheduled", "confirmed"] },
  })
    .select("scheduledAt duration")
    .lean();

  // Build busy windows (interview time + buffer on both sides) in UTC
  const busyWindows = existingInterviews.map((iv) => {
    const start = new Date(iv.scheduledAt);
    const end = addMinutes(start, (iv.duration ?? 30) + timeBuffer);
    const bufferedStart = addMinutes(start, -timeBuffer);
    return { start: bufferedStart, end };
  });

  // Generate available 30-min slots for each day in range
  const result: { date: string; dayName: string; timezone: string; slots: { start: string; end: string }[] }[] = [];

  for (let d = 0; d < rangeDays; d++) {
    const curDate = addDays(startDate, d);
    const localDateStr = toDateStr(curDate, tz);
    const dayName = toDayName(curDate, tz);
    const hours = dayHoursMap.get(dayName);

    if (!hours) {
      result.push({ date: localDateStr, dayName, timezone: tz, slots: [] });
      continue;
    }

    // Build slot start/end in UTC from local times
    const dayStart = fromLocalTime(localDateStr, hours.startTime, tz);
    const dayEnd = fromLocalTime(localDateStr, hours.endTime, tz);
    const slots: { start: string; end: string }[] = [];

    let cursor = dayStart;
    while (cursor < dayEnd) {
      const slotEnd = addMinutes(cursor, 30);
      if (slotEnd > dayEnd) break;

      // Check overlap with busy windows
      const isBusy = busyWindows.some(
        (w) => cursor < w.end && slotEnd > w.start,
      );

      if (!isBusy) {
        slots.push({
          start: toHHmm(cursor, tz),
          end: toHHmm(slotEnd, tz),
        });
      }

      cursor = slotEnd;
    }

    result.push({ date: localDateStr, dayName, timezone: tz, slots });
  }

  return NextResponse.json({
    seekerId,
    timezone: tz,
    timeBuffer,
    availability: result,
  });
}

export const GET = withAuth(handler, { resource: "interviews", action: "read" });
