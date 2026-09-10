/**
 * @jest-environment node
 */
import {
  availabilityUrl,
  availabilityWindowStart,
  firstFreeSlots,
  localDateString,
  toDateTimeLocal,
  zonedToDate,
  type AvailabilityDay,
} from "@/lib/interviews/availabilitySlots";

describe("availabilitySlots", () => {
  it("turns a candidate-zone wall time into the right instant", () => {
    expect(zonedToDate("2026-09-11", "10:00", "Asia/Dubai").toISOString()).toBe("2026-09-11T06:00:00.000Z");
    expect(zonedToDate("2026-09-11", "10:00", "Asia/Kolkata").toISOString()).toBe("2026-09-11T04:30:00.000Z");
  });

  it("follows daylight saving in zones that have it", () => {
    expect(zonedToDate("2026-01-15", "09:00", "Europe/London").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedToDate("2026-07-15", "09:00", "Europe/London").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("starts the window on the picked day, else today", () => {
    const today = new Date(2026, 8, 10, 15, 0); // local
    expect(availabilityWindowStart("", today)).toBe("2026-09-10");
    expect(availabilityWindowStart("not a date", today)).toBe("2026-09-10");
    const picked = new Date(2026, 8, 14, 9, 30);
    expect(availabilityWindowStart(picked.toISOString(), today)).toBe("2026-09-14");
    expect(availabilityWindowStart("2026-09-20T09:30", today)).toBe("2026-09-20");
  });

  it("formats dates for the picker in the viewer's zone", () => {
    const d = new Date(2026, 0, 5, 7, 8);
    expect(localDateString(d)).toBe("2026-01-05");
    expect(toDateTimeLocal(d)).toBe("2026-01-05T07:08");
  });

  it("builds the availability URL the API expects", () => {
    expect(availabilityUrl("64b000000000000000000040", "2026-09-11")).toBe(
      "/api/job-seekers/64b000000000000000000040/availability?date=2026-09-11&range=7"
    );
  });

  it("flattens to the first free future slots, skipping the past and capping the count", () => {
    const days: AvailabilityDay[] = [
      { date: "2026-09-11", dayName: "Fri", timezone: "Asia/Dubai", slots: [{ start: "09:00", end: "09:30" }, { start: "09:30", end: "10:00" }] },
      { date: "2026-09-12", dayName: "Sat", timezone: "Asia/Dubai", slots: [] },
      { date: "2026-09-13", dayName: "Sun", timezone: "Asia/Dubai", slots: [{ start: "14:00", end: "14:30" }, { start: "14:30", end: "15:00" }] },
    ];
    const now = new Date("2026-09-11T05:15:00.000Z"); // 09:15 Dubai — first slot already started
    const slots = firstFreeSlots(days, 2, now);
    expect(slots.map((s) => `${s.date} ${s.start}`)).toEqual(["2026-09-11 09:30", "2026-09-13 14:00"]);
    expect(slots[0].at.toISOString()).toBe("2026-09-11T05:30:00.000Z");
  });
});
