/**
 * @jest-environment node
 */
import { dayStartInZone, weekStartInZone } from "@/lib/datetime/zonedMonth";
import { isLeadPeriod, leadPeriodFilter } from "@/lib/leads/period";

describe("dayStartInZone / weekStartInZone", () => {
  it("uses the viewer's day: 01:00 Tuesday in Dubai is still Monday in UTC", () => {
    const now = new Date("2026-10-26T21:00:00Z"); // Tue 27 Oct 01:00 Dubai
    expect(dayStartInZone("Asia/Dubai", now).toISOString()).toBe("2026-10-26T20:00:00.000Z");
    expect(dayStartInZone("UTC", now).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("weeks start on Monday local time", () => {
    // Tue 27 Oct → Mon 26 Oct; Sun 1 Nov → Mon 26 Oct; Mon 26 Oct → itself
    expect(weekStartInZone("Asia/Dubai", new Date("2026-10-27T08:00:00Z")).toISOString()).toBe("2026-10-25T20:00:00.000Z");
    expect(weekStartInZone("Asia/Dubai", new Date("2026-11-01T08:00:00Z")).toISOString()).toBe("2026-10-25T20:00:00.000Z");
    expect(weekStartInZone("Asia/Dubai", new Date("2026-10-26T08:00:00Z")).toISOString()).toBe("2026-10-25T20:00:00.000Z");
  });

  it("walks back across a month boundary", () => {
    expect(weekStartInZone("UTC", new Date("2026-10-02T10:00:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});

describe("leadPeriodFilter", () => {
  const now = new Date("2026-10-27T08:00:00Z");

  it("converted_today = won since local midnight", () => {
    expect(leadPeriodFilter("converted_today", "Asia/Dubai", now)).toEqual({
      status: "converted",
      convertedAt: { $gte: new Date("2026-10-26T20:00:00.000Z") },
    });
  });

  it("active_week = open leads added or contacted since Monday", () => {
    const monday = new Date("2026-10-25T20:00:00.000Z");
    expect(leadPeriodFilter("active_week", "Asia/Dubai", now)).toEqual({
      status: { $in: ["new", "contacted", "interested", "negotiating"] },
      $or: [{ createdAt: { $gte: monday } }, { lastContactedAt: { $gte: monday } }],
    });
  });

  it("rejects unknown periods", () => {
    expect(isLeadPeriod("converted_today")).toBe(true);
    expect(isLeadPeriod("all")).toBe(false);
    expect(isLeadPeriod(undefined)).toBe(false);
  });
});
