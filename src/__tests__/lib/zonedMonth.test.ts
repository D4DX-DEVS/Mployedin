/**
 * @jest-environment node
 */
import { monthStartInZone, recentMonthKeys } from "@/lib/datetime/zonedMonth";

describe("monthStartInZone", () => {
  it("uses the viewer's month: 01:30 on 1 Oct in Kolkata is already October there", () => {
    const now = new Date("2026-09-30T20:00:00Z"); // 01:30 IST, 1 Oct
    expect(monthStartInZone("Asia/Kolkata", now).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(monthStartInZone("Asia/Kolkata", now, 1).toISOString()).toBe("2026-08-31T18:30:00.000Z");
    // The same instant is still September in UTC.
    expect(monthStartInZone("UTC", now).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("follows daylight saving: New York midnight is 05:00Z in March, 04:00Z on 1 November", () => {
    expect(monthStartInZone("America/New_York", new Date("2026-03-15T12:00:00Z")).toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(monthStartInZone("America/New_York", new Date("2026-11-15T12:00:00Z")).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("walks back across a year boundary", () => {
    expect(monthStartInZone("Asia/Dubai", new Date("2026-02-10T08:00:00Z"), 5).toISOString()).toBe("2025-08-31T20:00:00.000Z");
  });
});

describe("recentMonthKeys", () => {
  it("lists the last N months oldest first, in MongoDB's %Y-%m shape", () => {
    expect(recentMonthKeys("UTC", new Date("2026-01-15T00:00:00Z"), 6)).toEqual([
      "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01",
    ]);
  });

  it("keys the current month by the viewer's calendar", () => {
    const now = new Date("2026-09-30T20:00:00Z");
    expect(recentMonthKeys("Asia/Kolkata", now, 2)).toEqual(["2026-09", "2026-10"]);
    expect(recentMonthKeys("UTC", now, 2)).toEqual(["2026-08", "2026-09"]);
  });
});
