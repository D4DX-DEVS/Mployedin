import fs from "fs";
import path from "path";

/**
 * A calendar day cell is a *local-midnight* Date. Reading its day back with
 * `toISOString()` reads it in UTC, which is the previous day for every UTC+
 * zone — Dubai (+4), Riyadh (+3), Karachi (+5), Kolkata (+5:30). The booking
 * modal did exactly that, so an employer who clicked the 21st booked the 20th.
 *
 * Nothing catches this: tsc is happy, the string is well-formed, and the
 * default `selectedDate` is `new Date()` (which carries a clock time and so
 * survives the conversion), meaning the bug only fires once someone picks a
 * *different* day. That is why it reached production.
 *
 * Booking payload days come from `bookingSlots()`, which works off the local
 * calendar fields. This guard keeps the ISO shortcut from creeping back.
 */
const SCHEDULING_FILES = [
  "src/components/shared/InterviewBookingModal.tsx",
  "src/components/shared/MployedinCalendar.tsx",
];

/** Blanks comments while preserving offsets, so prose about the bug is not a hit. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

describe("booking dates stay in the viewer's timezone", () => {
  it.each(SCHEDULING_FILES)("%s derives no calendar day from toISOString()", (rel) => {
    const src = stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
    const hits = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)/.test(line));

    expect(hits).toEqual([]);
  });

  it("builds booking payloads through bookingSlots()", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/shared/InterviewBookingModal.tsx"),
      "utf8",
    );
    expect(src).toMatch(/from\s+["']@\/lib\/interviews\/bookingSlots["']/);
  });

  it("keeps the leads date quick-filters on the local day", () => {
    const src = stripComments(
      fs.readFileSync(
        path.join(process.cwd(), "src/app/[locale]/(dashboard)/super-agent/leads/page.tsx"),
        "utf8",
      ),
    );
    // Same class of bug: "This week" wrote a dateFrom one day early in UTC+ zones.
    expect(src).not.toMatch(/toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)/);
  });
});
