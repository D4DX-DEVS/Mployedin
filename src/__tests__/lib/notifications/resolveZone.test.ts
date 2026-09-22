/**
 * @jest-environment node
 *
 * The in-app notification list re-renders `params.dateIso` client-side. It too
 * used a literal `timeZone: "Asia/Dubai"`, so the app agreed with the old
 * (wrong) emails rather than with the reader's own calendar.
 *
 * It now honours `params.timeZone`, which the trigger records. The fallback
 * stays a *fixed* zone rather than the viewer's: a "use client" component
 * renders once on the server too, and a viewer-zone fallback would produce a
 * different string there — a hydration failure.
 */
import { resolveNotificationText } from "@/lib/notifications/resolve";

const KEYS = new Set(["interviewScheduledBody", "interviewScheduledTitle"]);

function translator(): {
  (key: string, values?: Record<string, string | number | Date>): string;
  has: (key: string) => boolean;
} {
  const t = (key: string, values?: Record<string, string | number | Date>) =>
    key === "interviewScheduledBody" ? `at ${values?.date}` : key;
  return Object.assign(t, { has: (key: string) => KEYS.has(key) });
}

function build(params: Record<string, unknown>) {
  return resolveNotificationText(
    {
      title: "Interview Scheduled",
      body: "legacy body",
      meta: { titleKey: "interviewScheduledTitle", bodyKey: "interviewScheduledBody", params },
    },
    translator(),
    "en",
  );
}

// 06:00 UTC = 10:00 Dubai, 07:00 London (BST), 11:30 Kolkata.
const DATE_ISO = "2026-09-21T06:00:00Z";

describe("resolveNotificationText date rendering", () => {
  it("renders in the zone the notification recorded", () => {
    expect(build({ dateIso: DATE_ISO, timeZone: "Europe/London" }).body).toMatch(/7:00|07:00/);
    expect(build({ dateIso: DATE_ISO, timeZone: "Asia/Kolkata" }).body).toMatch(/11:30/);
  });

  it("names the zone", () => {
    expect(build({ dateIso: DATE_ISO, timeZone: "Asia/Kolkata" }).body).toContain("GMT+5:30");
  });

  it("keeps legacy rows on the fixed fallback so they read as written", () => {
    // Pre-existing notifications carry no timeZone param; they were composed in
    // Dubai time, so Dubai time is what they should keep showing.
    expect(build({ dateIso: DATE_ISO }).body).toMatch(/10:00/);
  });

  it("ignores a stored zone this runtime cannot resolve", () => {
    expect(build({ dateIso: DATE_ISO, timeZone: "Mars/Olympus" }).body).toMatch(/10:00/);
  });

  it("leaves the body alone when the date is unparseable", () => {
    expect(build({ dateIso: "not a date" }).body).toBe("at undefined");
  });
});
