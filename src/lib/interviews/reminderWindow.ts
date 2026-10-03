/**
 * Whether an interview already sits inside the hourly cron's 24 hour reminder
 * window (`/api/cron/interview-reminders`).
 *
 * That cron sends its "24 hour" reminder to every interview less than 24 h away
 * that is not marked `reminderSent`, and the reminder's text is the booking
 * notice ("Interview Scheduled"). An interview booked or moved inside the
 * window would get its invitation and then, within the hour, the same message
 * again. Marking it `reminderSent: true` at that moment skips the second
 * message; the 1 hour reminder needs `reminderSent: true`, so it still fires.
 */

/** How often the reminder cron runs (`interviewRemindersCron`, `0 * * * *`). */
export const REMINDER_CRON_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How far ahead an interview is still "inside the window" at booking time: the
 * cron's 24 h plus one cron interval. The cron only looks every hour, so an
 * interview booked 24 to 25 h ahead crosses the 24 h line before the next run
 * and would still be sent the reminder within the hour of its invitation.
 * Anything up to 25 h out is therefore marked reminded, which means a slot
 * between 24 and 25 h away gets no separate 24 hour reminder.
 */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000 + REMINDER_CRON_INTERVAL_MS;

export function isInsideReminderWindow(scheduledAt: Date, now: Date = new Date()): boolean {
  return scheduledAt.getTime() - now.getTime() < REMINDER_WINDOW_MS;
}
