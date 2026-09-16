/**
 * @jest-environment node
 *
 * The new-job form used to restore whatever sat in localStorage, silently and
 * forever: an employer clicking "Write it myself" got a half-filled form from a
 * forgotten session (QA found a City field reading "12345") with nothing to say
 * it was not a fresh start. Drafts now expire, and what survives is offered
 * rather than applied.
 */
import { parseStoredDraft, DRAFT_MAX_AGE_MS } from "@/components/features/employer/job-form/jobDraftStorage";

const values = { title: "QA Automation Tester" } as never;

describe("parseStoredDraft", () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);

  it("returns a recent draft with the time it was written", () => {
    const raw = JSON.stringify({ values, savedAt: now - 60_000 });
    expect(parseStoredDraft(raw, now)).toEqual({ values, savedAt: now - 60_000 });
  });

  it("drops a draft older than the maximum age", () => {
    const raw = JSON.stringify({ values, savedAt: now - DRAFT_MAX_AGE_MS - 1 });
    expect(parseStoredDraft(raw, now)).toBeNull();
  });

  it("drops a draft with no timestamp — age cannot be judged", () => {
    expect(parseStoredDraft(JSON.stringify({ values }), now)).toBeNull();
  });

  it("survives absent or corrupt storage", () => {
    expect(parseStoredDraft(null, now)).toBeNull();
    expect(parseStoredDraft("{not json", now)).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ savedAt: now }), now)).toBeNull();
  });
});
