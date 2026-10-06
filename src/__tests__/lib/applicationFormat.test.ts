/**
 * QA retest 2026-10-06 (BUG-06): the Applications list read "Applied Oct 1"
 * and "₹50K - ₹70K"; the same application's page read "Applied 10/1/2026" and
 * "INR 50,000 – 70,000". Both pages now format through one module.
 */
import {
  formatApplicationSalary,
  formatApplicationDate,
  collapseStatusHistory,
} from "@/lib/jobSeeker/applicationFormat";

// Intl puts a no-break space between a currency code and the amount.
const plain = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;

describe("formatApplicationDate", () => {
  it("reads the same on both pages, with the year where there is room", () => {
    expect(formatApplicationDate("2026-10-01T09:00:00.000Z", "en")).toBe("Oct 1");
    expect(formatApplicationDate("2026-10-01T09:00:00.000Z", "en", { withYear: true })).toBe("Oct 1, 2026");
  });

  it("returns an empty string for a missing date", () => {
    expect(formatApplicationDate(undefined, "en")).toBe("");
  });
});

describe("formatApplicationSalary", () => {
  it("uses the currency symbol and compact amounts", () => {
    expect(formatApplicationSalary({ min: 50000, max: 70000, currency: "INR" }, "en")).toBe("₹50K - ₹70K");
  });

  it("shows an open-ended amount when only one bound is set", () => {
    expect(plain(formatApplicationSalary({ min: 12000, currency: "AED" }, "en"))).toBe("AED 12K+");
    expect(plain(formatApplicationSalary({ max: 12000, currency: "AED" }, "en"))).toBe("AED 12K");
  });

  it("shows a fixed figure once instead of 'AED 12K - AED 12K'", () => {
    expect(plain(formatApplicationSalary({ min: 12000, max: 12000, currency: "AED" }, "en"))).toBe("AED 12K");
  });

  it("returns null with no amount or currency", () => {
    expect(formatApplicationSalary({ currency: "INR" }, "en")).toBeNull();
    expect(formatApplicationSalary(undefined, "en")).toBeNull();
  });

  it("falls back to the code for a currency Intl doesn't know", () => {
    expect(formatApplicationSalary({ min: 1000, max: 2000, currency: "XX1" }, "en")).toBe("1,000 - 2,000 XX1");
  });
});

describe("collapseStatusHistory", () => {
  it("keeps the first entry of each run of the same status", () => {
    const history = [
      { status: "applied", changedAt: "2026-07-20T06:11:27Z" },
      { status: "interview_scheduled", changedAt: "2026-07-20T06:15:27Z" },
      { status: "interview_scheduled", changedAt: "2026-07-20T06:40:33Z" },
      { status: "selected", changedAt: "2026-07-21T06:40:33Z" },
      { status: "offer", changedAt: "2026-07-22T06:40:33Z" },
      { status: "selected", changedAt: "2026-07-23T06:40:33Z" },
    ];
    expect(collapseStatusHistory(history).map((h) => h.status)).toEqual([
      "applied", "interview_scheduled", "selected", "offer", "selected",
    ]);
    expect(collapseStatusHistory(history)[1].changedAt).toBe("2026-07-20T06:15:27Z");
  });
});
