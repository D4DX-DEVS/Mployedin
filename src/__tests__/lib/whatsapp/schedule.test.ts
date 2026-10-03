/**
 * @jest-environment node
 */
import { CronExpressionParser } from "cron-parser";
import { validateCronExpression, validateTimezone, computeNextRunAt } from "@/lib/communications/whatsapp/schedule";

describe("validateCronExpression", () => {
  it("accepts once-per-hour-or-slower expressions", () => {
    expect(validateCronExpression("0 9 * * 1")).toBeNull();
    expect(validateCronExpression("30 18 1 * *")).toBeNull();
    expect(validateCronExpression("15 */2 * * *")).toBeNull();
  });
  it("rejects sub-hourly, malformed and non-5-field expressions", () => {
    expect(validateCronExpression("*/5 * * * *")).toMatch(/once per hour/);
    expect(validateCronExpression("* 9 * * *")).toMatch(/once per hour/);
    expect(validateCronExpression("0,30 9 * * *")).toMatch(/once per hour/);
    expect(validateCronExpression("0 9 * *")).toMatch(/five fields/);
    expect(validateCronExpression("0 25 * * *")).toMatch(/Invalid cron/);
  });

  it("accepts the hourly boundary and ordinary hour lists, ranges and names", () => {
    expect(validateCronExpression("0 * * * *")).toBeNull();
    expect(validateCronExpression("59 * * * *")).toBeNull();
    expect(validateCronExpression("0 9-11 * * *")).toBeNull();
    expect(validateCronExpression("30 1,2 * * *")).toBeNull();
    expect(validateCronExpression("0 9 * * MON")).toBeNull();
    expect(validateCronExpression("  0   9 * * 1  ")).toBeNull();
  });

  it("rejects every way of writing more than one fire per hour in the minute field", () => {
    for (const expr of [
      "*/30 * * * *",
      "0,30 * * * *",
      "0-30 * * * *",
      "5/10 * * * *",
      "*/1 * * * *",
      "H * * * *",
      "00,01 * * * *",
    ]) {
      expect(validateCronExpression(expr)).toMatch(/once per hour/);
    }
  });

  it("rejects six-field (seconds) and seven-field expressions even though cron-parser accepts them", () => {
    // Proves the guard is ours: cron-parser itself happily parses a seconds field.
    expect(() => CronExpressionParser.parse("*/5 * * * * *")).not.toThrow();
    expect(validateCronExpression("*/5 * * * * *")).toMatch(/five fields/);
    expect(validateCronExpression("0 0 * * * *")).toMatch(/five fields/);
    expect(validateCronExpression("0 0 9 * * 1 2026")).toMatch(/five fields/);
  });

  it("rejects macros, empty input and expressions that can never fire", () => {
    expect(validateCronExpression("@hourly")).toMatch(/five fields/);
    expect(validateCronExpression("@daily")).toMatch(/five fields/);
    expect(validateCronExpression("")).toMatch(/five fields/);
    expect(validateCronExpression("60 * * * *")).toMatch(/once per hour/);
    expect(validateCronExpression("0 9 31 2 *")).toMatch(/Invalid cron/);
    expect(validateCronExpression("0 9 * * 8")).toMatch(/Invalid cron/);
  });

  it("rejects cron-parser's Jenkins H token in every field, because it re-randomises on each parse", () => {
    // Proves why: the same expression lands on different hours from one parse to the next.
    const hours = new Set<number>();
    for (let i = 0; i < 40; i++) {
      hours.add(
        CronExpressionParser.parse("0 H * * *", { currentDate: new Date("2026-09-29T12:00:00Z"), tz: "UTC" })
          .next()
          .toDate()
          .getUTCHours(),
      );
    }
    expect(hours.size).toBeGreaterThan(1);

    for (const expr of [
      "0 H * * *",
      "0 H(9-17) * * *",
      "0 H/2 * * *",
      "0 9 H * *",
      "0 9 * H *",
      "0 9 * * H",
      "0 9 * * H-3",
      "0 9,H * * *",
      "0 9 * * 1,H(1-3)",
      // Malformed spellings cron-parser still randomises (or garbles).
      "0 */H * * *",
      "0 1/H * * *",
      "0 9 * * H#2",
      "0 HH * * *",
    ]) {
      expect(validateCronExpression(expr)).toMatch(/hash/i);
    }
  });

  it("still accepts day and month names that merely contain an H", () => {
    expect(validateCronExpression("0 9 * * THU")).toBeNull();
    expect(validateCronExpression("0 9 * * thu")).toBeNull();
    expect(validateCronExpression("0 9 * * MON-FRI")).toBeNull();
    expect(validateCronExpression("0 9 * * THU,SAT")).toBeNull();
    expect(validateCronExpression("0 9 * MAR-OCT *")).toBeNull();
  });
});

describe("validateTimezone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(validateTimezone("Asia/Dubai")).toBeNull();
    expect(validateTimezone("Mars/Olympus")).toMatch(/timezone/i);
  });
  it("rejects empty and whitespace zones", () => {
    expect(validateTimezone("")).toMatch(/timezone/i);
    expect(validateTimezone("   ")).toMatch(/timezone/i);
  });

  it("accepts zones with whole-hour DST, fractional offsets and no DST", () => {
    for (const tz of [
      "UTC",
      "Asia/Dubai",
      "Asia/Kolkata", // +05:30, no DST
      "Asia/Kathmandu", // +05:45, no DST
      "Europe/London",
      "America/New_York",
      "America/St_Johns", // -03:30, one-hour DST
      "Pacific/Chatham", // +12:45, one-hour DST
      "Antarctica/Troll", // two-hour DST
    ]) {
      expect(validateTimezone(tz)).toBeNull();
    }
  });

  it("rejects a zone whose DST moves the clocks by part of an hour (Australia/Lord_Howe)", () => {
    expect(validateTimezone("Australia/Lord_Howe")).toMatch(/timezone/i);
    expect(validateTimezone("Australia/LHI")).toMatch(/timezone/i); // alias of the same zone
  });

  // Canary for the refusal above. cron-parser 5.10.1 fires a single-minute cron twice
  // within 30 minutes on Lord Howe's April fall-back, so the one-fire-per-hour floor
  // cannot hold there. If this starts failing after a cron-parser upgrade, re-check
  // the zone and drop hasSubHourDstShift if the library is fixed.
  it("is backed by cron-parser really breaking the hourly floor on that zone", () => {
    const iter = CronExpressionParser.parse("59 * * * *", {
      currentDate: new Date("2026-04-04T14:00:00Z"),
      tz: "Australia/Lord_Howe",
    });
    const first = iter.next().toDate().getTime();
    const second = iter.next().toDate().getTime();
    expect(second - first).toBe(30 * 60_000);
  });

  it("only accepts zones computeNextRunAt can schedule in", () => {
    for (const tz of ["UTC", "Asia/Kolkata", "Asia/Kathmandu", "America/St_Johns", "Pacific/Chatham", "Antarctica/Troll"]) {
      expect(validateTimezone(tz)).toBeNull();
      expect(
        computeNextRunAt({ kind: "recurring", cron: "30 9 * * 1", timezone: tz }, new Date("2026-09-29T12:00:00Z")),
      ).not.toBeNull();
    }
  });
});

describe("computeNextRunAt", () => {
  const from = new Date("2026-09-29T12:00:00Z"); // a Tuesday
  it("finds the next Monday 09:00 in the schedule's zone", () => {
    expect(computeNextRunAt({ kind: "recurring", cron: "0 9 * * 1", timezone: "Asia/Dubai" }, from)).toEqual(new Date("2026-10-05T05:00:00.000Z"));
  });
  it("follows DST in the zone (Europe/London falls back on 2026-10-25)", () => {
    expect(computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: "Europe/London" }, new Date("2026-10-23T12:00:00Z"))).toEqual(new Date("2026-10-24T08:00:00.000Z"));
    expect(computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: "Europe/London" }, new Date("2026-10-24T12:00:00Z"))).toEqual(new Date("2026-10-25T09:00:00.000Z"));
  });
  it("returns the run time for a future one-off and null for a past or missing one", () => {
    expect(computeNextRunAt({ kind: "once", runAt: "2026-10-01T06:00:00Z", timezone: "Asia/Dubai" }, from)).toEqual(new Date("2026-10-01T06:00:00Z"));
    expect(computeNextRunAt({ kind: "once", runAt: "2026-09-01T06:00:00Z", timezone: "Asia/Dubai" }, from)).toBeNull();
    expect(computeNextRunAt({ kind: "once", timezone: "Asia/Dubai" }, from)).toBeNull();
    expect(computeNextRunAt({ kind: "recurring", cron: "not a cron", timezone: "Asia/Dubai" }, from)).toBeNull();
  });

  describe("DST transitions", () => {
    const london = (cron: string, fromIso: string) =>
      computeNextRunAt({ kind: "recurring", cron, timezone: "Europe/London" }, new Date(fromIso));

    it("keeps 09:00 local across the spring-forward (Europe/London, 2026-03-29)", () => {
      expect(london("0 9 * * *", "2026-03-27T12:00:00Z")).toEqual(new Date("2026-03-28T09:00:00.000Z")); // GMT
      expect(london("0 9 * * *", "2026-03-28T12:00:00Z")).toEqual(new Date("2026-03-29T08:00:00.000Z")); // BST
    });

    it("runs a wall time that does not exist once, shifted past the gap (01:30 on 2026-03-29)", () => {
      expect(london("30 1 * * *", "2026-03-28T12:00:00Z")).toEqual(new Date("2026-03-29T01:30:00.000Z"));
      // ...and the following day returns to 01:30 local (00:30Z, BST), not a skipped or doubled run.
      expect(london("30 1 * * *", "2026-03-29T01:30:00.000Z")).toEqual(new Date("2026-03-30T00:30:00.000Z"));
    });

    it("runs a wall time that happens twice only once (01:30 on 2026-10-25)", () => {
      const first = london("30 1 * * *", "2026-10-24T12:00:00Z");
      expect(first).toEqual(new Date("2026-10-25T00:30:00.000Z"));
      expect(london("30 1 * * *", first!.toISOString())).toEqual(new Date("2026-10-26T01:30:00.000Z"));
    });

    // The frequency floor, checked against the real library: with one minute value the
    // hourly schedules the validator accepts must never fire twice inside an hour, in
    // every zone validateTimezone accepts, across both of its 2026 clock changes.
    it.each([
      ["Europe/London", "2026-03-29", "2026-10-25"],
      ["America/New_York", "2026-03-08", "2026-11-01"],
      ["America/St_Johns", "2026-03-08", "2026-11-01"],
      ["Antarctica/Troll", "2026-03-29", "2026-10-25"],
      ["Pacific/Chatham", "2026-04-05", "2026-09-27"],
    ])("never fires an hourly schedule twice inside an hour across the %s clock changes", (timezone, spring, autumn) => {
      for (const day of [spring, autumn]) {
        const start = new Date(`${day}T00:00:00Z`).getTime() - 24 * 3_600_000;
        const end = start + 72 * 3_600_000;
        for (const cron of ["0 * * * *", "30 * * * *", "59 * * * *"]) {
          expect(validateCronExpression(cron)).toBeNull();
          const fires: number[] = [];
          let cursor = new Date(start);
          for (let i = 0; i < 100; i++) {
            const next = computeNextRunAt({ kind: "recurring", cron, timezone }, cursor);
            if (!next || next.getTime() >= end) break;
            fires.push(next.getTime());
            cursor = next;
          }
          expect(fires.length).toBeGreaterThan(60);
          const gaps = fires.slice(1).map((t, i) => t - fires[i]);
          expect(Math.min(...gaps)).toBeGreaterThanOrEqual(60 * 60_000);
        }
      }
    });

    it("is unaffected by the northern DST dates in a zone without DST (Asia/Dubai)", () => {
      const dubai = (fromIso: string) =>
        computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: "Asia/Dubai" }, new Date(fromIso));
      expect(dubai("2026-03-28T12:00:00Z")).toEqual(new Date("2026-03-29T05:00:00.000Z"));
      expect(dubai("2026-10-24T12:00:00Z")).toEqual(new Date("2026-10-25T05:00:00.000Z"));
    });
  });

  describe("boundaries", () => {
    const utc = (fromIso: string) =>
      computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: "UTC" }, new Date(fromIso));

    it("is strictly after `from`: a fire time equal to or just past `from` moves to the next day", () => {
      expect(utc("2026-09-29T09:00:00.000Z")).toEqual(new Date("2026-09-30T09:00:00.000Z"));
      expect(utc("2026-09-29T09:00:00.500Z")).toEqual(new Date("2026-09-30T09:00:00.000Z"));
      expect(utc("2026-09-29T08:59:59.999Z")).toEqual(new Date("2026-09-29T09:00:00.000Z"));
    });

    it("does not fall back to the server's own zone when the schedule's zone is missing or unknown", () => {
      expect(computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: "Mars/Olympus" }, from)).toBeNull();
      expect(computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: "" }, from)).toBeNull();
      expect(
        computeNextRunAt({ kind: "recurring", cron: "0 9 * * *", timezone: undefined as unknown as string }, from),
      ).toBeNull();
    });

    it("returns null for a recurring schedule with no cron", () => {
      expect(computeNextRunAt({ kind: "recurring", timezone: "UTC" }, from)).toBeNull();
      expect(computeNextRunAt({ kind: "recurring", cron: null, timezone: "UTC" }, from)).toBeNull();
    });

    it("treats a one-off at exactly `from`, an unparseable one and a Date instance correctly", () => {
      expect(computeNextRunAt({ kind: "once", runAt: from, timezone: "UTC" }, from)).toBeNull();
      expect(computeNextRunAt({ kind: "once", runAt: "not a date", timezone: "UTC" }, from)).toBeNull();
      const later = new Date("2026-10-01T06:00:00Z");
      expect(computeNextRunAt({ kind: "once", runAt: later, timezone: "UTC" }, from)).toEqual(later);
    });

    it("trims the cron expression like the validator does", () => {
      expect(computeNextRunAt({ kind: "recurring", cron: "  0 9 * * *  ", timezone: "UTC" }, from)).toEqual(
        new Date("2026-09-30T09:00:00.000Z"),
      );
    });
  });
});
