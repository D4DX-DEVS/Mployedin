/**
 * @jest-environment node
 */
import {
  buildSchedule,
  cloneSchedule,
  dayNumber,
  defaultBounds,
  distributeByWeights,
  expectedProgress,
  fromStoredPeriods,
  isIsoDate,
  monthlyTargets,
  periodStatus,
  resolveSchedule,
  scheduleIssues,
  shiftScheduleYear,
  splitProfit,
  toStoredPeriods,
  validateSchedule,
  type SchedulePeriod,
} from "@/lib/targets/schedule";

const cents = (periods: { profitTarget: number }[]) => periods.reduce((sum, p) => sum + Math.round(p.profitTarget * 100), 0);
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("defaultBounds", () => {
  it("cuts a year into 1, 4, 12 or about 53 periods that cover it without a gap", () => {
    expect(defaultBounds("annual", 2027)).toEqual([{ startDate: "2027-01-01", endDate: "2027-12-31" }]);
    expect(defaultBounds("quarterly", 2027).map((b) => b.endDate)).toEqual(["2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31"]);
    expect(defaultBounds("monthly", 2028)[1]).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" }); // a leap year
    expect(defaultBounds("custom", 2027)).toEqual(defaultBounds("annual", 2027));

    for (const type of ["quarterly", "monthly", "weekly"] as const) {
      const bounds = defaultBounds(type, 2027);
      expect(bounds[0].startDate).toBe("2027-01-01");
      expect(bounds[bounds.length - 1].endDate).toBe("2027-12-31");
      bounds.slice(1).forEach((b, i) => expect(dayNumber(b.startDate)).toBe(dayNumber(bounds[i].endDate) + 1));
    }
  });

  it("makes weeks run Monday to Sunday, clipped to the year at both ends", () => {
    const weeks = defaultBounds("weekly", 2027); // 1 Jan 2027 is a Friday
    expect(weeks[0]).toEqual({ startDate: "2027-01-01", endDate: "2027-01-03" });
    expect(weeks[1]).toEqual({ startDate: "2027-01-04", endDate: "2027-01-10" });
    expect(weeks[weeks.length - 1]).toEqual({ startDate: "2027-12-27", endDate: "2027-12-31" });
    expect(weeks).toHaveLength(53);
  });
});

describe("splitProfit", () => {
  it("splits equally with the odd cents to the first periods", () => {
    const amounts = splitProfit(1000, defaultBounds("monthly", 2027), "equal");
    expect(amounts[0]).toBe(83.34);
    expect(amounts[11]).toBe(83.33);
    expect(cents(amounts.map((profitTarget) => ({ profitTarget })))).toBe(100000);
  });

  it("splits a fractional target exactly, for every period type", () => {
    for (const type of ["annual", "quarterly", "monthly", "weekly"] as const) {
      for (const strategy of ["equal", "seasonal"] as const) {
        const periods = buildSchedule({ periodType: type, year: 2027, profitTarget: 1000.5, strategy });
        expect(cents(periods)).toBe(100050);
      }
    }
  });

  it("weighs a season 30/20/30/20, however finely the year is cut", () => {
    const quarterTotals = (type: "quarterly" | "monthly" | "weekly") => {
      const periods = buildSchedule({ periodType: type, year: 2027, profitTarget: 120000, strategy: "seasonal" });
      const totals = [0, 0, 0, 0];
      for (const p of periods) totals[Math.floor((Number(p.startDate.slice(5, 7)) - 1) / 3)] += p.profitTarget;
      return totals.map((value) => Math.round(value));
    };

    expect(quarterTotals("quarterly")).toEqual([36000, 24000, 36000, 24000]);
    expect(quarterTotals("monthly")).toEqual([36000, 24000, 36000, 24000]);
    expect(quarterTotals("weekly")).toEqual([36000, 24000, 36000, 24000]);
  });

  it("gives an annual schedule the whole amount", () => {
    expect(buildSchedule({ periodType: "annual", year: 2027, profitTarget: 5000, strategy: "seasonal" })[0].profitTarget).toBe(5000);
  });

  it("shares by weight and always sums to the total", () => {
    const shares = distributeByWeights(10001, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10001);
    expect(distributeByWeights(500, [0, 0])).toEqual([250, 250]);
  });
});

describe("scheduleIssues / validateSchedule", () => {
  const sound = (): SchedulePeriod[] => buildSchedule({ periodType: "quarterly", year: 2027, profitTarget: 1000, strategy: "equal" });

  it("accepts a schedule that adds up", () => {
    expect(validateSchedule(sound(), 2027, 1000, "quarterly")).toEqual([]);
  });

  it("names what is wrong with a schedule that does not", () => {
    const code = (periods: SchedulePeriod[], type: "quarterly" | "custom" = "custom", annual = 1000) =>
      scheduleIssues(periods, 2027, annual, type)[0]?.code;

    expect(code([])).toBe("empty");
    expect(code([{ startDate: "2027-02-30", endDate: "2027-03-01", profitTarget: 1000 }])).toBe("dates");
    expect(code([{ startDate: "2027-03-10", endDate: "2027-03-01", profitTarget: 1000 }])).toBe("reversed");
    expect(code([{ startDate: "2026-12-30", endDate: "2027-01-05", profitTarget: 1000 }])).toBe("outsideYear");
    expect(code([
      { startDate: "2027-01-01", endDate: "2027-02-10", profitTarget: 500 },
      { startDate: "2027-02-10", endDate: "2027-03-01", profitTarget: 500 },
    ])).toBe("overlap");
    expect(code([{ startDate: "2027-01-01", endDate: "2027-02-10", profitTarget: -5 }])).toBe("amount");
    expect(code([{ startDate: "2027-01-01", endDate: "2027-02-10", profitTarget: 400 }])).toBe("sum");
  });

  it("makes a standard type use its standard periods, so a label cannot lie", () => {
    const custom = [{ startDate: "2027-01-01", endDate: "2027-12-31", profitTarget: 1000 }];
    expect(scheduleIssues(custom, 2027, 1000, "quarterly")[0].code).toBe("standard");
    expect(scheduleIssues(custom, 2027, 1000, "annual")).toEqual([]);
  });

  it("lets a custom schedule leave gaps between its periods", () => {
    const gappy: SchedulePeriod[] = [
      { startDate: "2027-03-01", endDate: "2027-03-31", profitTarget: 400 },
      { startDate: "2027-09-01", endDate: "2027-09-30", profitTarget: 600 },
    ];
    expect(scheduleIssues(gappy, 2027, 1000, "custom")).toEqual([]);
  });

  it("rejects too many periods", () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ startDate: "2027-01-01", endDate: "2027-01-01", profitTarget: i }));
    expect(scheduleIssues(many, 2027, 0, "custom")[0].code).toBe("tooMany");
  });
});

describe("resolveSchedule", () => {
  it("generates the standard periods from a type and a split", () => {
    const resolved = resolveSchedule({ year: 2027, profitTarget: 1200, periodType: "quarterly", strategy: "equal" });
    expect("periods" in resolved && resolved.periods.map((p) => p.profitTarget)).toEqual([300, 300, 300, 300]);
  });

  it("will not guess a custom schedule or a typed split", () => {
    expect("error" in resolveSchedule({ year: 2027, profitTarget: 1200, periodType: "custom", strategy: "equal" })).toBe(true);
    expect("error" in resolveSchedule({ year: 2027, profitTarget: 1200, periodType: "monthly", strategy: "custom" })).toBe(true);
    // One period has nothing to type.
    expect("periods" in resolveSchedule({ year: 2027, profitTarget: 1200, periodType: "annual", strategy: "custom" })).toBe(true);
  });

  it("checks the periods it is given", () => {
    const periods = buildSchedule({ periodType: "monthly", year: 2027, profitTarget: 1200, strategy: "equal" });
    expect("periods" in resolveSchedule({ year: 2027, profitTarget: 1200, periodType: "monthly", strategy: "custom", periods })).toBe(true);
    expect("error" in resolveSchedule({ year: 2027, profitTarget: 1300, periodType: "monthly", strategy: "custom", periods })).toBe(true);
  });
});

describe("monthlyTargets", () => {
  it("gives a monthly schedule its own months back", () => {
    const periods = buildSchedule({ periodType: "monthly", year: 2027, profitTarget: 1200, strategy: "seasonal" });
    expect(monthlyTargets(periods)).toEqual(periods.map((p) => p.profitTarget));
  });

  it("spreads any other schedule over the months by days, keeping the total exactly", () => {
    const annual = monthlyTargets(buildSchedule({ periodType: "annual", year: 2027, profitTarget: 36500, strategy: "equal" }));
    expect(annual[0]).toBeCloseTo((36500 * 31) / 365, 1);
    expect(annual[1]).toBeCloseTo((36500 * 28) / 365, 1);
    expect(Math.round(annual.reduce((a, b) => a + b, 0) * 100)).toBe(3650000);

    const weekly = monthlyTargets(buildSchedule({ periodType: "weekly", year: 2027, profitTarget: 53000, strategy: "equal" }));
    expect(Math.round(weekly.reduce((a, b) => a + b, 0) * 100)).toBe(5300000);
  });

  it("puts a custom range's amount in the months it covers and nowhere else", () => {
    const months = monthlyTargets([{ startDate: "2027-03-01", endDate: "2027-04-30", profitTarget: 6100 }]);
    expect(months.map((m, i) => (m > 0 ? i + 1 : 0)).filter(Boolean)).toEqual([3, 4]);
    expect(Math.round(months.reduce((a, b) => a + b, 0) * 100)).toBe(610000);
  });
});

describe("expectedProgress and periodStatus", () => {
  const monthly = buildSchedule({ periodType: "monthly", year: 2027, profitTarget: 1200, strategy: "equal" });

  it("expects nothing before the schedule, all of it after, and a share of the current period during", () => {
    expect(expectedProgress(monthly, 2027, noon("2026-10-15"))).toBe(0);
    expect(expectedProgress(monthly, 2027, noon("2028-01-02"))).toBe(100);
    // Half way through June: 5 months + half of the sixth of 12.
    expect(expectedProgress(monthly, 2027, noon("2027-06-15"))).toBe(Math.round(((5 + 15 / 30) / 12) * 100));
  });

  it("paces an annual schedule by days, and a custom one only inside its own range", () => {
    const annual = buildSchedule({ periodType: "annual", year: 2027, profitTarget: 1000, strategy: "equal" });
    expect(expectedProgress(annual, 2027, noon("2027-07-02"))).toBe(Math.round((183 / 365) * 100));

    const campaign: SchedulePeriod[] = [{ startDate: "2027-03-01", endDate: "2027-03-31", profitTarget: 1000 }];
    expect(expectedProgress(campaign, 2027, noon("2027-02-10"))).toBe(0);
    expect(expectedProgress(campaign, 2027, noon("2027-08-10"))).toBe(100);
  });

  it("falls back to the share of the year gone by when there is no target", () => {
    const empty = buildSchedule({ periodType: "monthly", year: 2027, profitTarget: 0, strategy: "equal" });
    expect(expectedProgress(empty, 2027, noon("2027-06-15"))).toBe(50);
    expect(expectedProgress(empty, 2026, noon("2027-06-15"))).toBe(100);
  });

  it("calls a period upcoming, current or past by the day", () => {
    const march = { startDate: "2027-03-01", endDate: "2027-03-31" };
    expect(periodStatus(march, "2027-02-28")).toBe("upcoming");
    expect(periodStatus(march, "2027-03-01")).toBe("current");
    expect(periodStatus(march, "2027-03-31")).toBe("current");
    expect(periodStatus(march, "2027-04-01")).toBe("past");
  });
});

describe("cloneSchedule", () => {
  it("cuts a standard schedule afresh for the new year at the new amount", () => {
    const source = { periodType: "quarterly" as const, strategy: "seasonal" as const, periods: buildSchedule({ periodType: "quarterly", year: 2026, profitTarget: 1000, strategy: "seasonal" }) };
    const cloned = cloneSchedule(source, 2027, 2000);

    expect(cloned.strategy).toBe("seasonal");
    expect(cloned.periods.map((p) => p.profitTarget)).toEqual([600, 400, 600, 400]);
    expect(cloned.periods[0].startDate).toBe("2027-01-01");
  });

  it("keeps the shape of typed amounts when the new year has the same periods", () => {
    const periods = buildSchedule({ periodType: "quarterly", year: 2026, profitTarget: 1000, strategy: "equal" }).map((p, i) => ({ ...p, profitTarget: [100, 200, 300, 400][i] }));
    const cloned = cloneSchedule({ periodType: "quarterly", strategy: "custom", periods }, 2027, 2000);

    expect(cloned.strategy).toBe("custom");
    expect(cloned.periods.map((p) => p.profitTarget)).toEqual([200, 400, 600, 800]);
  });

  it("drops typed amounts back to equal when a weekly year has a different number of weeks", () => {
    // 2040 is a leap year that starts on a Sunday: a one-day first week makes 54 periods against 2027's 53.
    const weeks2040 = defaultBounds("weekly", 2040).length;
    const weeks2027 = defaultBounds("weekly", 2027).length;
    expect(weeks2040).not.toBe(weeks2027);

    const periods = buildSchedule({ periodType: "weekly", year: 2040, profitTarget: 1000, strategy: "equal" });
    const cloned = cloneSchedule({ periodType: "weekly", strategy: "custom", periods }, 2027, 1000);
    expect(cloned.strategy).toBe("equal");
    expect(cloned.periods).toHaveLength(weeks2027);
  });

  it("moves a custom schedule's dates into the new year with its proportions", () => {
    const periods: SchedulePeriod[] = [
      { label: "Spring push", startDate: "2026-03-01", endDate: "2026-04-30", profitTarget: 300 },
      { startDate: "2026-09-01", endDate: "2026-09-30", profitTarget: 700 },
    ];
    const cloned = cloneSchedule({ periodType: "custom", strategy: "custom", periods }, 2027, 2000);

    expect(cloned.periods.map((p) => [p.startDate, p.endDate, p.profitTarget])).toEqual([
      ["2027-03-01", "2027-04-30", 600],
      ["2027-09-01", "2027-09-30", 1400],
    ]);
    expect(cloned.periods[0].label).toBe("Spring push");
  });

  it("clamps 29 February to the 28th in a year without one", () => {
    expect(shiftScheduleYear([{ startDate: "2028-02-29", endDate: "2028-03-05", profitTarget: 1 }], 2027)[0].startDate).toBe("2027-02-28");
  });
});

describe("stored form", () => {
  it("round-trips periods through UTC midnights", () => {
    const periods: SchedulePeriod[] = [{ label: "Q1 push", startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 250.5 }];
    const stored = toStoredPeriods(periods);

    expect(stored[0].startDate.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(fromStoredPeriods(stored)).toEqual(periods);
  });

  it("recognises real dates only", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2027-2-9")).toBe(false);
  });
});
