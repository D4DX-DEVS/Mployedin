/**
 * Owner 2026-10-07: the Applications table's "Oct 06, 2026" wrapped onto two
 * lines in its column. The compact form drops the year when it is this year and
 * keeps the month a word (06/10 means different days in the Gulf and the US).
 */
import { formatCompactDate } from "@/lib/ui/intlFormat";

const NOW = new Date("2026-10-07T09:00:00");

describe("formatCompactDate", () => {
  it("leaves out the year for a date this year", () => {
    expect(formatCompactDate("2026-10-06T10:00:00", "en", NOW)).toBe("Oct 6");
    expect(formatCompactDate(new Date("2026-01-02T10:00:00"), "en", NOW)).toBe("Jan 2");
  });

  it("keeps the year for an earlier year", () => {
    expect(formatCompactDate("2025-09-25T10:00:00", "en", NOW)).toBe("Sep 25, 2025");
  });

  it("writes the month as a word in Arabic too, with Latin digits", () => {
    const ar = formatCompactDate("2026-10-06T10:00:00", "ar", NOW);
    expect(ar).toMatch(/6/);
    expect(ar).not.toMatch(/2026|\//);
  });

  it("returns a dash for missing or bad input", () => {
    expect(formatCompactDate(null, "en", NOW)).toBe("—");
    expect(formatCompactDate("not a date", "en", NOW)).toBe("—");
  });
});
