/**
 * @jest-environment node
 *
 * "Nothing matched" is not news. On 2026-09-23 the daily run sent 188 job
 * emails and 187 of them said "No strong job matches this week" — 99% of our
 * recommendation mail told people we had nothing for them. Indeed only mails
 * when a new job matches; Naukri's recommendations likewise carry jobs. The
 * owner's rule (2026-09-24): no strong match, no email.
 *
 * A digest still goes out when recruiters viewed the profile — that is real
 * news — and it may then explain why no job made the cut. It is never sent
 * for the explanation alone.
 */
import fs from "fs";
import path from "path";
import { hasDigestContent } from "@/lib/notifications/digestGate";

describe("hasDigestContent", () => {
  it("sends when at least one job cleared the bar", () => {
    expect(hasDigestContent({ jobCount: 1, profileViewCount: 0 })).toBe(true);
  });

  it("sends when recruiters viewed the profile, even with no job matches", () => {
    expect(hasDigestContent({ jobCount: 0, profileViewCount: 2 })).toBe(true);
  });

  it("sends nothing when no job matched and nobody viewed the profile", () => {
    expect(hasDigestContent({ jobCount: 0, profileViewCount: 0 })).toBe(false);
  });
});

describe("guard: the daily cron never mails a seeker just to say nothing matched", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/lib/inngest/dailyRecommendations.ts"),
    "utf8",
  );

  it("decides whether to send through hasDigestContent", () => {
    expect(src).toMatch(/hasDigestContent\(/);
  });

  it("no longer runs a separate near-miss email cooldown", () => {
    // The cooldown only existed to ration the standalone "no matches" email.
    // It is what locked 201 seekers out until 7 October after the 09-23 run.
    expect(src).not.toMatch(/lastNearMissSentAt/);
    expect(src).not.toMatch(/NEAR_MISS_COOLDOWN/);
  });
});
