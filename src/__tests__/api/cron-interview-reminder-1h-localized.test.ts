/**
 * @jest-environment node
 *
 * The one-hour interview reminder was written with English literals only and
 * no `titleKey`/`bodyKey`, so an Arabic reader got English in the bell, in the
 * email and on WhatsApp. It now carries notificationContent keys, the same way
 * the 24-hour reminder (notifyInterviewScheduled) does, and the English
 * templates reproduce the stored English text exactly.
 *
 * `minutes` is a number and the body keys are ICU plurals, so "1 minute" and
 * Arabic's six plural forms read correctly instead of "1 minutes".
 */
import { NextRequest } from "next/server";
import { IntlMessageFormat } from "intl-messageformat";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

jest.mock("@/lib/security/cron-auth", () => ({ verifyCronRequest: () => null }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notify: (...a: unknown[]) => notify(...a),
  notifyInterviewScheduled: jest.fn().mockResolvedValue(undefined),
}));

// First find() is the 24-hour sweep, second the 1-hour sweep.
let sweeps: unknown[][] = [];
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    find: () => {
      const result = sweeps.shift() ?? [];
      const c: Record<string, unknown> = {};
      for (const m of ["limit", "populate", "select"]) c[m] = () => c;
      c.lean = async () => result;
      return c;
    },
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  },
}));

import { GET } from "@/app/api/cron/interview-reminders/route";

const KEYS = ["interviewStartingSoonTitle", "interviewStartingSoonBody", "interviewStartingSoonWithLinkBody"] as const;
const MEET = "https://meet.example.com/abc";

function soon(meetLink: string | undefined, minutes: number) {
  return {
    _id: "650000000000000000000050",
    jobSeekerId: { userId: { _id: "650000000000000000000031" } },
    jobId: { title: "Nurse" },
    // The route rounds (scheduledAt - now) to whole minutes, so a few ms of
    // drift between here and its own clock does not change the result.
    scheduledAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    meetLink,
    metadata: {},
  };
}

interface Reminder {
  title: string;
  message: string;
  titleKey?: string;
  bodyKey?: string;
  params?: { jobTitle: string; minutes: number; meetLink?: string };
}

async function remind(meetLink?: string, minutes = 45): Promise<Reminder> {
  sweeps = [[], [soon(meetLink, minutes)]];
  await GET(new NextRequest("http://localhost/api/cron/interview-reminders"));
  expect(notify).toHaveBeenCalledTimes(1);
  return notify.mock.calls[0][0] as Reminder;
}

const content = (messages: unknown) => (messages as { notificationContent: Record<string, string> }).notificationContent;
const render = (messages: unknown, locale: "en" | "ar", key: (typeof KEYS)[number], params: Record<string, unknown>) =>
  String(new IntlMessageFormat(content(messages)[key], locale).format(params));

beforeEach(() => jest.clearAllMocks());

describe("1-hour interview reminder", () => {
  it("carries the localization keys and the meeting link", async () => {
    const payload = await remind(MEET);
    expect(payload).toEqual(
      expect.objectContaining({
        titleKey: "interviewStartingSoonTitle",
        bodyKey: "interviewStartingSoonWithLinkBody",
        params: { jobTitle: "Nurse", minutes: 45, meetLink: MEET },
      }),
    );
    expect(render(en, "en", "interviewStartingSoonTitle", payload.params!)).toBe(payload.title);
    expect(render(en, "en", "interviewStartingSoonWithLinkBody", payload.params!)).toBe(payload.message);
  });

  it("uses the body without a link when the interview has none", async () => {
    const payload = await remind(undefined);
    expect(payload.bodyKey).toBe("interviewStartingSoonBody");
    expect(payload.params).toEqual({ jobTitle: "Nurse", minutes: 45 });
    expect(render(en, "en", "interviewStartingSoonBody", payload.params!)).toBe(payload.message);
  });

  it("passes minutes as a number", async () => {
    const payload = await remind(undefined, 30);
    expect(typeof payload.params?.minutes).toBe("number");
    expect(payload.params?.minutes).toBe(30);
  });

  it.each([["en", en], ["ar", ar]] as const)("%s has every key as valid ICU using only the params sent", (locale, messages) => {
    const params = { jobTitle: "Nurse", minutes: 45, meetLink: MEET };
    for (const key of KEYS) {
      const template = content(messages)[key];
      expect(typeof template).toBe("string");
      const out = String(new IntlMessageFormat(template, locale).format(params));
      expect(out).not.toMatch(/[{}]/);
    }
    expect(content(messages).interviewStartingSoonWithLinkBody).toContain("{meetLink}");
    expect(content(messages).interviewStartingSoonBody).not.toContain("{meetLink}");
  });
});

describe("1-hour interview reminder wording by minutes", () => {
  // [minutes, English unit, Arabic phrase after "خلال"]. Arabic: one, two, few (3-10), many (11-99).
  const cases: Array<[number, string, string]> = [
    [1, "1 minute", "دقيقة واحدة"],
    [2, "2 minutes", "دقيقتين"],
    [5, "5 minutes", "5 دقائق"],
    [30, "30 minutes", "30 دقيقة"],
  ];

  it.each(cases)("the cron sends %i minutes and both locales word it correctly", async (minutes, enUnit, arUnit) => {
    const payload = await remind(MEET, minutes);
    expect(payload.params?.minutes).toBe(minutes);
    // The stored English text is the fallback and the WhatsApp/email source for
    // English readers; it has to agree with the key.
    expect(payload.message).toBe(`Your interview for "Nurse" starts in ${enUnit}. Join: ${MEET}`);
    expect(render(en, "en", "interviewStartingSoonWithLinkBody", payload.params!)).toBe(payload.message);
    expect(render(ar, "ar", "interviewStartingSoonWithLinkBody", payload.params!)).toBe(
      `تبدأ مقابلتك لوظيفة "Nurse" خلال ${arUnit}. رابط الانضمام: ${MEET}`,
    );
  });

  it.each(cases)("the body without a link words %i minutes correctly", (minutes, enUnit, arUnit) => {
    const params = { jobTitle: "Nurse", minutes };
    expect(render(en, "en", "interviewStartingSoonBody", params)).toBe(`Your interview for "Nurse" starts in ${enUnit}.`);
    expect(render(ar, "ar", "interviewStartingSoonBody", params)).toBe(`تبدأ مقابلتك لوظيفة "Nurse" خلال ${arUnit}.`);
  });

  it("covers Arabic's zero and other forms too", () => {
    expect(render(ar, "ar", "interviewStartingSoonBody", { jobTitle: "Nurse", minutes: 0 })).toBe(`تبدأ مقابلتك لوظيفة "Nurse" خلال 0 دقيقة.`);
    expect(render(ar, "ar", "interviewStartingSoonBody", { jobTitle: "Nurse", minutes: 100 })).toBe(`تبدأ مقابلتك لوظيفة "Nurse" خلال 100 دقيقة.`);
  });
});
