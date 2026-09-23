/**
 * @jest-environment node
 *
 * The product's stated default for profile-based job recommendations is
 * *weekly*. It was never reached by anyone.
 *
 * `NotificationPreference.emailFrequency` used to carry `default: "daily"`, and
 * the documents are created lazily the first time anything reads a user's
 * preferences — so every account ended up storing an answer nobody had given.
 * 208 of the 224 live documents held "daily" and not one of those users had
 * chosen it. Because `resolveDigestCadence` reads the stored field *first*,
 * that default silently outranked both the seeker's stated availability and the
 * admin's platform setting, leaving two configuration surfaces dead and the
 * weekly default unreachable.
 *
 * These tests pin the fix: the field is written only by a real choice.
 */
import NotificationPreference from "@/models/NotificationPreference";
import { resolveDigestCadence } from "@/lib/notifications/digestGate";

describe("NotificationPreference.emailFrequency", () => {
  it("is absent on a freshly created document, not silently 'daily'", () => {
    const doc = new NotificationPreference({ userId: "64b000000000000000000001" });
    expect(doc.emailFrequency).toBeUndefined();
  });

  it("still defaults the things that SHOULD default", () => {
    // Removing one default must not have removed the category defaults, which
    // the orchestrator reads as "opted in".
    const doc = new NotificationPreference({ userId: "64b000000000000000000001" });
    expect(doc.categories.jobs.enabled).toBe(true);
    expect(doc.unsubscribedAll).toBeFalsy();
  });

  it("accepts and keeps an explicit choice", async () => {
    for (const choice of ["instant", "daily", "weekly", "none"] as const) {
      const doc = new NotificationPreference({
        userId: "64b000000000000000000001",
        emailFrequency: choice,
      });
      expect(doc.emailFrequency).toBe(choice);
      await expect(doc.validate()).resolves.toBeUndefined();
    }
  });

  it("validates when the field is absent — it is optional, not required", async () => {
    const doc = new NotificationPreference({ userId: "64b000000000000000000001" });
    await expect(doc.validate()).resolves.toBeUndefined();
  });

  it("rejects a value outside the enum", async () => {
    const doc = new NotificationPreference({
      userId: "64b000000000000000000001",
      emailFrequency: "hourly",
    });
    await expect(doc.validate()).rejects.toThrow(/emailFrequency/);
  });
});

describe("what a never-chosen preference resolves to", () => {
  it("falls through to the platform default instead of forcing daily", () => {
    const fresh = new NotificationPreference({ userId: "64b000000000000000000001" });
    // The exact shape digestGate reads, straight off a fresh document.
    const pref = { emailFrequency: fresh.emailFrequency, unsubscribedAll: fresh.unsubscribedAll };
    expect(resolveDigestCadence(pref, "weekly")).toBe("weekly");
    expect(resolveDigestCadence(pref, "daily")).toBe("daily");
  });

  it("lets stated availability win over the platform default, as designed", () => {
    const fresh = new NotificationPreference({ userId: "64b000000000000000000001" });
    const pref = { emailFrequency: fresh.emailFrequency };
    const answered = { status: "immediately", setAt: new Date("2026-09-01") };
    expect(resolveDigestCadence(pref, "weekly", answered)).toBe("daily");
  });

  it("is still outranked by a real choice", () => {
    expect(resolveDigestCadence({ emailFrequency: "weekly" }, "daily")).toBe("weekly");
    expect(resolveDigestCadence({ emailFrequency: "none" }, "daily")).toBe("none");
  });
});
