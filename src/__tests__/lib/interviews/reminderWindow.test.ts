/**
 * @jest-environment node
 *
 * The hourly reminder cron sends its "24 hour" reminder to every interview less
 * than 24 h away that is not marked reminded, so an interview booked inside that
 * window has to be marked reminded at booking time or it is announced twice.
 * The cron only runs once an hour, so "inside the window" has to reach one cron
 * interval past 24 h: an interview booked 24.5 h ahead crosses the 24 h line
 * before the next run and would still get the reminder.
 */
import {
  isInsideReminderWindow,
  REMINDER_CRON_INTERVAL_MS,
  REMINDER_WINDOW_MS,
} from "@/lib/interviews/reminderWindow";

const HOUR = 3_600_000;
const now = new Date("2026-10-05T08:00:00.000Z");
const ahead = (ms: number) => new Date(now.getTime() + ms);

describe("isInsideReminderWindow", () => {
  it("is true for an interview 3 hours ahead", () => {
    expect(isInsideReminderWindow(ahead(3 * HOUR), now)).toBe(true);
  });

  it("is false for an interview 3 days ahead", () => {
    expect(isInsideReminderWindow(ahead(72 * HOUR), now)).toBe(false);
  });

  it("is true 24.5 hours ahead, which the next hourly cron run would still remind", () => {
    expect(isInsideReminderWindow(ahead(24.5 * HOUR), now)).toBe(true);
  });

  it("is false 26 hours ahead", () => {
    expect(isInsideReminderWindow(ahead(26 * HOUR), now)).toBe(false);
  });

  it("reaches 24 hours plus one cron interval, and no further", () => {
    expect(REMINDER_CRON_INTERVAL_MS).toBe(HOUR);
    expect(REMINDER_WINDOW_MS).toBe(24 * HOUR + REMINDER_CRON_INTERVAL_MS);
    expect(isInsideReminderWindow(ahead(REMINDER_WINDOW_MS - 1), now)).toBe(true);
    expect(isInsideReminderWindow(ahead(REMINDER_WINDOW_MS), now)).toBe(false);
  });

  it("is true for a time that has already passed", () => {
    expect(isInsideReminderWindow(ahead(-HOUR), now)).toBe(true);
  });

  it("defaults to the current time", () => {
    expect(isInsideReminderWindow(new Date(Date.now() + 3 * HOUR))).toBe(true);
    expect(isInsideReminderWindow(new Date(Date.now() + 72 * HOUR))).toBe(false);
  });
});
