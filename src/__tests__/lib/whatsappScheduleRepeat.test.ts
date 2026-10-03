/**
 * @jest-environment node
 */
import {
  DEFAULT_REPEAT, EMPTY_FORM, cronFromRepeat, describeRepeat, repeatFromCron, toBody, toForm, toPatchBody, validateForm, type Repeat, type ScheduleForm,
} from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/_components/scheduleForm";
import type { Translator, WaSchedule, WaTemplate } from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/_components/shared";
import IntlMessageFormat from "intl-messageformat";

const en = require("../../../messages/en.json") as { adminWhatsApp: Record<string, string> };
const ar = require("../../../messages/ar.json") as { adminWhatsApp: Record<string, string> };

/** Formats the real locale message, as next-intl does. */
const translator = (messages: Record<string, string>, locale: string): Translator => (key, values) =>
  String(new IntlMessageFormat(messages[key], locale).format(values as never));
const tEn = translator(en.adminWhatsApp, "en");
const tAr = translator(ar.adminWhatsApp, "ar");

const repeat = (patch: Partial<Repeat>): Repeat => ({ ...DEFAULT_REPEAT, ...patch });

describe("cronFromRepeat", () => {
  it("builds the three shapes the picker offers", () => {
    expect(cronFromRepeat(repeat({ frequency: "daily", hour: 9, minute: 0 }))).toBe("0 9 * * *");
    expect(cronFromRepeat(repeat({ frequency: "weekly", hour: 14, minute: 30, weekdays: [4, 1] }))).toBe("30 14 * * 1,4");
    expect(cronFromRepeat(repeat({ frequency: "monthly", hour: 7, minute: 5, dayOfMonth: 28 }))).toBe("5 7 28 * *");
  });

  it("writes Sunday as 0 and lists each weekday once, in order", () => {
    expect(cronFromRepeat(repeat({ frequency: "weekly", weekdays: [6, 0, 6, 3] }))).toBe("0 9 * * 0,3,6");
  });
});

describe("repeatFromCron", () => {
  it("reads back every shape the picker writes", () => {
    expect(repeatFromCron("0 9 * * *")).toEqual(repeat({ frequency: "daily", hour: 9, minute: 0 }));
    expect(repeatFromCron("30 14 * * 1,4")).toEqual(repeat({ frequency: "weekly", hour: 14, minute: 30, weekdays: [1, 4] }));
    expect(repeatFromCron("5 7 28 * *")).toEqual(repeat({ frequency: "monthly", hour: 7, minute: 5, dayOfMonth: 28 }));
    expect(repeatFromCron("0 0 * * 0")).toEqual(repeat({ frequency: "weekly", hour: 0, minute: 0, weekdays: [0] }));
  });

  it("tolerates extra spaces around and between the fields", () => {
    expect(repeatFromCron("  0  9 * *   1 ")).toEqual(repeat({ frequency: "weekly", weekdays: [1] }));
  });

  it("round-trips: cronFromRepeat(repeatFromCron(x)) is x for the picker's own shapes", () => {
    for (const cron of ["0 9 * * *", "55 23 * * 0,1,2,3,4,5,6", "15 6 1 * *", "7 9 * * *"]) {
      expect(cronFromRepeat(repeatFromCron(cron) as Repeat)).toBe(cron);
    }
  });

  it.each([
    ["a range of weekdays", "0 9 * * 1-5"],
    ["a step", "*/15 * * * *"],
    ["an hourly schedule", "0 * * * *"],
    ["a list of hours", "0 9,17 * * *"],
    ["a day of the month after the 28th", "0 9 31 * *"],
    ["day 0 of the month", "0 9 0 * *"],
    ["a month field", "0 9 1 6 *"],
    ["both a day of the month and a weekday", "0 9 1 * 1"],
    ["weekday 7 for Sunday", "0 9 * * 7"],
    ["unsorted weekdays", "0 9 * * 4,1"],
    ["a weekday listed twice", "0 9 * * 1,1"],
    ["leading zeros", "00 09 * * 1"],
    ["a minute out of range", "60 9 * * *"],
    ["an hour out of range", "0 24 * * *"],
    ["six fields", "0 0 9 * * 1"],
    ["four fields", "0 9 * *"],
    ["a name for the weekday", "0 9 * * MON"],
    ["an empty string", ""],
  ])("returns null for %s (%s): the picker cannot express it", (_label, cron) => {
    expect(repeatFromCron(cron)).toBeNull();
  });
});

describe("describeRepeat", () => {
  it("says the repeat in plain English with localized day names", () => {
    expect(describeRepeat(repeat({ frequency: "daily", hour: 9, minute: 0 }), tEn, "en")).toBe("Every day at 09:00");
    expect(describeRepeat(repeat({ frequency: "weekly", hour: 9, minute: 0, weekdays: [1, 4] }), tEn, "en")).toBe("Every Monday and Thursday at 09:00");
    expect(describeRepeat(repeat({ frequency: "monthly", hour: 14, minute: 30, dayOfMonth: 5 }), tEn, "en")).toBe("Every month on day 5 at 14:30");
  });

  it("lists three or more days with the locale's list joiner, Monday first", () => {
    expect(describeRepeat(repeat({ frequency: "weekly", weekdays: [0, 1, 5] }), tEn, "en")).toBe("Every Monday, Friday, and Sunday at 09:00");
  });

  it("uses Arabic day names and the Arabic copy for the Arabic locale", () => {
    const text = describeRepeat(repeat({ frequency: "weekly", hour: 9, minute: 0, weekdays: [1, 4] }), tAr, "ar");
    expect(text).toContain("الاثنين");
    expect(text).toContain("الخميس");
    expect(text).toContain("⁦09:00⁩");
    expect(text).not.toMatch(/Monday|Thursday/);
  });
});

describe("schedule form timing", () => {
  const now = new Date("2026-10-02T12:00:00.000Z");
  const base: WaSchedule = {
    _id: "s1", name: "Digest", enabled: true, kind: "recurring", cron: "0 9 * * 1", timezone: "Asia/Dubai",
    template: { templateName: "hello_world", language: "en_US", params: [] },
    audience: { targetAll: true, targetRoles: [] },
  };
  const approved: WaTemplate[] = [
    { _id: "t", name: "hello_world", language: "en_US", category: "UTILITY", status: "APPROVED", bodyText: "Hello", bodyParamCount: 0, lastSyncedAt: "2026-10-01T00:00:00Z" },
  ];

  it("starts a new form on Mondays at 09:00", () => {
    expect(EMPTY_FORM.repeat).toEqual(repeat({ frequency: "weekly", weekdays: [1], hour: 9, minute: 0 }));
  });

  it("opens a schedule the picker can express with the picker filled in", () => {
    expect(toForm({ ...base, cron: "30 14 * * 1,4" }).repeat).toEqual(repeat({ frequency: "weekly", hour: 14, minute: 30, weekdays: [1, 4] }));
  });

  it("opens a custom timing with no picker value and keeps its cron untouched on save", () => {
    const custom = { ...base, cron: "0 9 * * 1-5" };
    const form = toForm(custom);
    expect(form.repeat).toBeNull();
    // A rename sends no timing at all.
    expect(toPatchBody({ ...form, name: "Renamed" }, custom, now)).not.toHaveProperty("cron");
    expect(toBody(form).cron).toBe("0 9 * * 1-5");
  });

  it("replaces a custom timing only once the admin picks a repeat", () => {
    const custom = { ...base, cron: "0 9 * * 1-5" };
    const form: ScheduleForm = { ...toForm(custom), repeat: repeat({ frequency: "daily", hour: 8, minute: 15 }) };
    expect(toPatchBody(form, custom, now)).toEqual(expect.objectContaining({ cron: "15 8 * * *" }));
  });

  it("sends no cron when the picker still says what was stored, even with other spacing", () => {
    const spaced = { ...base, cron: " 0  9 * * 1" };
    expect(toPatchBody(toForm(spaced), spaced, now)).not.toHaveProperty("cron");
  });

  it("sends no cron for a custom timing stored with repeated inner spaces, and still sends it as stored when it is sent", () => {
    // The server only trims a cron, so an API-set "0  9 * * 1-5" is kept as typed. The picker cannot express a range: custom timing.
    const spaced = { ...base, cron: "0  9 * * 1-5" };
    const form = toForm(spaced);
    expect(form.repeat).toBeNull();
    // A rename must not look like a timing change (the route would recompute nextRunAt from now).
    expect(toPatchBody({ ...form, name: "Renamed" }, spaced, now)).not.toHaveProperty("cron");
    // Padding around the stored cron is no change either.
    expect(toPatchBody({ ...form, cron: "  0  9 * * 1-5 " }, spaced, now)).not.toHaveProperty("cron");
    // Sent as stored (not collapsed) wherever the timing is sent: a new schedule, or a real change.
    expect(toBody(form).cron).toBe("0  9 * * 1-5");
    expect(toPatchBody({ ...form, cron: "0  10 * * 1-5" }, spaced, now)).toEqual(expect.objectContaining({ cron: "0  10 * * 1-5" }));
  });

  it("sends the built cron when the picker changed", () => {
    const form: ScheduleForm = { ...toForm(base), repeat: repeat({ frequency: "monthly", dayOfMonth: 5, hour: 14, minute: 30 }) };
    expect(toPatchBody(form, base, now)).toEqual(expect.objectContaining({ cron: "30 14 5 * *" }));
    expect(toBody(form).cron).toBe("30 14 5 * *");
  });

  it("asks for at least one day on a weekly repeat", () => {
    const form: ScheduleForm = { ...toForm(base), repeat: repeat({ frequency: "weekly", weekdays: [] }) };
    expect(validateForm(form, approved, { willRun: true, now }).repeat).toBe("days");
  });

  it("asks for a time when the hour or minute is not a real one", () => {
    const form: ScheduleForm = { ...toForm(base), repeat: repeat({ hour: Number.NaN }) };
    expect(validateForm(form, approved, { willRun: true, now }).repeat).toBe("time");
  });

  it("does not judge the picker of a one-time schedule, nor a custom timing", () => {
    const once: ScheduleForm = { ...toForm(base), kind: "once", runAt: "2026-11-01T09:00:00.000Z", repeat: repeat({ frequency: "weekly", weekdays: [] }) };
    expect(validateForm(once, approved, { willRun: true, now })).toEqual({});
    const custom = toForm({ ...base, cron: "0 9 * * 1-5" });
    expect(validateForm(custom, approved, { willRun: true, now })).toEqual({});
  });
});
