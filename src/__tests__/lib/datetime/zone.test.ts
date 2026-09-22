/**
 * @jest-environment node
 *
 * Interview times were rendered with a hardcoded `timeZone: "Asia/Dubai"` in
 * the notification/email path, so a candidate in London was told 14:00 for an
 * interview their own calendar showed at 10:00. And nothing anywhere printed
 * the zone, so a correct time still read as ambiguous across borders.
 */
import {
  formatZonedDateTime,
  formatZonedTime,
  formatZonedTimeRange,
  isValidTimeZone,
  timeZoneLabel,
  resolveViewerTimeZone,
} from "@/lib/datetime/zone";

// 2026-09-21 06:00 UTC = 10:00 Dubai, 11:30 Kolkata, 07:00 London (BST).
const INSTANT = new Date("2026-09-21T06:00:00Z");

describe("formatZonedTime", () => {
  it("renders the same instant as different wall times per zone", () => {
    expect(formatZonedTime(INSTANT, { timeZone: "Asia/Dubai", locale: "en" })).toMatch(/10:00/);
    expect(formatZonedTime(INSTANT, { timeZone: "Asia/Kolkata", locale: "en" })).toMatch(/11:30/);
    expect(formatZonedTime(INSTANT, { timeZone: "Europe/London", locale: "en" })).toMatch(/7:00|07:00/);
  });

  it("names the zone so a cross-border time is unambiguous", () => {
    // Which form ICU gives is locale-dependent, and `resolveIntlLocale` maps a
    // bare "en" to en-US (the app default), which prefers the offset form.
    expect(formatZonedTime(INSTANT, { timeZone: "Asia/Dubai", locale: "en" })).toContain("GMT+4");
    expect(formatZonedTime(INSTANT, { timeZone: "Asia/Kolkata", locale: "en" })).toContain("GMT+5:30");
    expect(formatZonedTime(INSTANT, { timeZone: "Asia/Dubai", locale: "en-GB" })).toContain("GST");
  });
});

describe("timeZoneLabel", () => {
  it("returns just the zone name", () => {
    expect(timeZoneLabel(INSTANT, "Asia/Dubai", "en")).toBe("GMT+4");
    expect(timeZoneLabel(INSTANT, "Asia/Dubai", "en-GB")).toBe("GST");
  });

  it("follows daylight saving rather than a fixed offset", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    expect(timeZoneLabel(winter, "Europe/London", "en-GB")).toBe("GMT");
    expect(timeZoneLabel(INSTANT, "Europe/London", "en-GB")).toBe("BST");
    // Same shift, offset form: +0 in winter, +1 under BST.
    expect(timeZoneLabel(winter, "Europe/London", "en")).toBe("GMT");
    expect(timeZoneLabel(INSTANT, "Europe/London", "en")).toBe("GMT+1");
  });

  it("returns an empty label instead of throwing on a bad zone", () => {
    expect(timeZoneLabel(INSTANT, "Not/AZone", "en")).toBe("");
  });
});

describe("formatZonedDateTime", () => {
  it("renders date, time and zone together", () => {
    const out = formatZonedDateTime(INSTANT, { timeZone: "Asia/Dubai", locale: "en" });
    expect(out).toMatch(/21/);
    expect(out).toMatch(/Sep/i);
    expect(out).toMatch(/10:00/);
    expect(out).toContain("GMT+4");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatZonedDateTime(INSTANT.toISOString(), { timeZone: "Asia/Dubai", locale: "en" })).toBe(
      formatZonedDateTime(INSTANT, { timeZone: "Asia/Dubai", locale: "en" }),
    );
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatZonedDateTime("not a date", { timeZone: "Asia/Dubai", locale: "en" })).toBe("");
  });

  it("falls back to the viewer's zone when none is given", () => {
    const viewer = resolveViewerTimeZone();
    expect(formatZonedDateTime(INSTANT, { locale: "en" })).toBe(
      formatZonedDateTime(INSTANT, { timeZone: viewer, locale: "en" }),
    );
  });

  it("falls back to the viewer's zone when the stored zone is invalid", () => {
    expect(formatZonedDateTime(INSTANT, { timeZone: "Not/AZone", locale: "en" })).toBe(
      formatZonedDateTime(INSTANT, { timeZone: resolveViewerTimeZone(), locale: "en" }),
    );
  });
});

describe("resolveViewerTimeZone", () => {
  it("reports a real IANA zone", () => {
    expect(resolveViewerTimeZone()).toMatch(/^[A-Za-z]+\/[A-Za-z_+\-/]+$|^UTC$/);
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Dubai")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects junk, blanks and nullish values without throwing", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe("formatZonedTimeRange", () => {
  const start = new Date("2026-09-21T06:00:00Z");
  const end = new Date("2026-09-21T06:30:00Z");

  it("renders both ends in the zone and names it once", () => {
    const out = formatZonedTimeRange(start, end, { timeZone: "Asia/Dubai", locale: "en" });
    expect(out).toMatch(/10:00/);
    expect(out).toMatch(/10:30/);
    expect(out.match(/GMT\+4/g)).toHaveLength(1);
  });

  it("renders a single time when there is no end", () => {
    const out = formatZonedTimeRange(start, null, { timeZone: "Asia/Dubai", locale: "en" });
    expect(out).toMatch(/10:00/);
    expect(out).not.toMatch(/10:30/);
    expect(out).toContain("GMT+4");
  });

  it("shifts both ends together across zones", () => {
    expect(formatZonedTimeRange(start, end, { timeZone: "Europe/London", locale: "en" })).toMatch(
      /7:00|07:00/,
    );
    expect(formatZonedTimeRange(start, end, { timeZone: "Asia/Kolkata", locale: "en" })).toMatch(
      /11:30/,
    );
  });

  it("returns an empty string when the start is unusable", () => {
    expect(formatZonedTimeRange("nope", null, { timeZone: "Asia/Dubai", locale: "en" })).toBe("");
  });
});
