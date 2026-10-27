/**
 * @jest-environment node
 *
 * Why the digest needs its hourly trigger — and what happened without it.
 *
 * The digest mails a seeker when their own clock reads 9am, which only works if
 * the cron fires every hour. Inngest Cloud kept running the pre-2026-09-23
 * schedule (once, at 09:00 UTC) because the app was never re-synced after a
 * deploy, and at 09:00 UTC it is 12:00–14:30 for the Gulf and Indian seekers
 * who make up the audience. Issue #11: none of them was mailed for five weeks.
 */
import { isDigestHourFor } from "@/lib/datetime/countryZone";

// One profile per live audience segment, written the way profiles state it.
const audience: Record<string, string> = {
  India: "Kochi, Kerala, India",
  Oman: "Muscat, Oman",
  "Saudi Arabia": "Riyadh, Saudi Arabia",
  UAE: "Dubai, UAE",
  Qatar: "Doha, Qatar",
  Bahrain: "Manama, Bahrain",
  // Unplaceable text falls back to Asia/Dubai — the QA seeker's own profile.
  "unplaceable (fallback)": "Malappuram Kerala",
};

const hourlyRuns = (day: string) =>
  Array.from({ length: 24 }, (_, h) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00Z`));

describe("digest trigger cadence", () => {
  it.each(Object.entries(audience))("an hourly trigger reaches a %s seeker exactly once a day", (_segment, location) => {
    const due = hourlyRuns("2026-10-27").filter((now) => isDigestHourFor({ currentLocation: location }, now));
    expect(due).toHaveLength(1);
  });

  it.each(Object.entries(audience))("the stale 09:00 UTC trigger never reaches a %s seeker", (_segment, location) => {
    expect(isDigestHourFor({ currentLocation: location }, new Date("2026-10-27T09:00:00Z"))).toBe(false);
  });
});
