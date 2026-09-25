/**
 * @jest-environment node
 *
 * The producer (dailyRecommendations) and the email builder were each tested,
 * but nothing tested the hop between them: the worker turning an Inngest event
 * into builder input. That hop forwarded every field by name except `nearMiss`,
 * so on 2026-09-23 all 187 "No strong job matches" emails went out with that
 * subject over a body that never said why — while the producer had already
 * claimed the 14-day near-miss cooldown for each of them.
 *
 * Every builder test passed `nearMiss` in directly, which is exactly why none
 * of them could see it being dropped. These tests go through the event.
 */
import {
  buildDigestEmail,
  digestEmailDataFromEvent,
} from "@/lib/inngest/dailyDigestWorker";
import type { NotificationDailyDigestEvent } from "@/lib/inngest/events";

type EventData = NotificationDailyDigestEvent["data"];

const base: EventData = {
  userId: "u1",
  userName: "Ilyas",
  email: "seeker@example.org",
  locale: "en",
  jobs: [],
  profileViews: { count: 0, viewers: [] },
  profile: { completeness: 40, signals: 3 },
};

const nearMiss = { bestScore: 37, threshold: 80, considered: 28, topBlocker: "no_skills" };

describe("digestEmailDataFromEvent", () => {
  it("forwards nearMiss — the field the worker used to drop", () => {
    expect(digestEmailDataFromEvent({ ...base, nearMiss }).nearMiss).toEqual(nearMiss);
  });

  it("forwards every field the builder reads", () => {
    const full: EventData = {
      ...base,
      jobs: [
        {
          jobId: "j1",
          title: "Site Engineer",
          company: "Beta Industries",
          location: "Dubai, UAE",
          matchScore: 88,
          salary: { min: 3000, max: 5000, currency: "AED", period: "monthly" },
          matchedSkills: ["AutoCAD"],
        },
      ],
      profileViews: { count: 1, viewers: [{ name: "Acme", role: "employer" }] },
      nearMiss,
    };
    const out = digestEmailDataFromEvent(full);
    expect(out).toEqual({
      // Forwarded so the footer can sign a working unsubscribe link.
      userId: full.userId,
      userName: full.userName,
      locale: full.locale,
      jobs: full.jobs,
      profileViews: full.profileViews,
      profile: full.profile,
      nearMiss: full.nearMiss,
    });
  });

  it("leaves nearMiss absent when the event carries none", () => {
    expect(digestEmailDataFromEvent(base).nearMiss).toBeUndefined();
  });
});

describe("event → rendered email, end to end", () => {
  const render = (data: EventData) => buildDigestEmail(digestEmailDataFromEvent(data));

  it("explains an empty digest instead of sending a bare subject line", () => {
    const html = render({ ...base, nearMiss });
    // The numbers the producer computed must reach the reader.
    expect(html).toContain("37%");
    expect(html).toContain("28");
    expect(html).toContain("80%");
  });

  it("carries matched skills through to the job card", () => {
    // matchedSkills survived only by luck — it rides inside `jobs`, which was
    // passed whole — and was missing from the event type. Pin it.
    const html = render({
      ...base,
      jobs: [
        {
          jobId: "j1",
          title: "Site Engineer",
          company: "Beta Industries",
          location: "Dubai, UAE",
          matchScore: 88,
          matchedSkills: ["AutoCAD", "Revit"],
        },
      ],
    });
    expect(html).toContain("AutoCAD, Revit");
  });

  it("renders no near-miss section when jobs did clear the bar", () => {
    const html = render({
      ...base,
      jobs: [
        {
          jobId: "j1",
          title: "Site Engineer",
          company: "Beta Industries",
          location: "Dubai, UAE",
          matchScore: 88,
        },
      ],
    });
    expect(html).not.toContain("No strong matches yet");
  });
});
