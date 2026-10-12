/**
 * The apply dialogs show their own translated copy for refusals they know —
 * a plan quota, or a job that has closed (JOB_CLOSED, audit FUNC-012) — and the
 * server's message for anything else. Both dialogs' namespaces must carry the
 * keys in English and Arabic: next-intl throws on a missing key.
 */
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { applyErrorKey } from "@/lib/applications/applyErrors";

describe("applyErrorKey", () => {
  it("maps plan-quota codes and a closed job to the dialog's own copy", () => {
    expect(applyErrorKey({ error: "LIMIT_EXCEEDED" })).toBe("planLimitReached");
    expect(applyErrorKey({ error: "SUBSCRIPTION_REQUIRED" })).toBe("planLimitReached");
    expect(applyErrorKey({ error: "This job is no longer taking applications.", code: "JOB_CLOSED" })).toBe("jobClosed");
  });

  it("leaves any other refusal to the server's message", () => {
    expect(applyErrorKey({ error: "Job seeker profile not found" })).toBeNull();
    expect(applyErrorKey(null)).toBeNull();
    expect(applyErrorKey(undefined)).toBeNull();
  });
});

describe("apply dialog copy", () => {
  const namespaces = [
    ["jobFeed.applyFlow.errors", (m: typeof en) => m.jobFeed.applyFlow.errors],
    ["easyApply.errors", (m: typeof en) => m.easyApply.errors],
  ] as const;

  it.each(namespaces)("%s has planLimitReached and jobClosed in English and Arabic", (_name, pick) => {
    for (const messages of [en, ar as unknown as typeof en]) {
      const errors = pick(messages) as Record<string, string>;
      expect(errors.planLimitReached).toBeTruthy();
      expect(errors.jobClosed).toBeTruthy();
    }
  });
});
