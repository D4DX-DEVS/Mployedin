import { autoRejectDecision, canRequestHumanReview, isHumanReviewPending } from "@/lib/hiring/automatedDecision";

describe("automated decision safeguards", () => {
  const decidedAt = new Date("2026-10-28T10:00:00Z");

  it("records the score, the employer's line and when it was decided", () => {
    expect(autoRejectDecision(32, 40, decidedAt)).toEqual({ kind: "auto_reject", score: 32, threshold: 40, decidedAt });
  });

  it("lets the candidate ask for a review of an auto-reject that still stands", () => {
    expect(canRequestHumanReview({ status: "rejected", automatedDecision: autoRejectDecision(32, 40, decidedAt) })).toBe(true);
  });

  it("allows one request only", () => {
    const decision = { ...autoRejectDecision(32, 40, decidedAt), reviewRequestedAt: new Date() };
    expect(canRequestHumanReview({ status: "rejected", automatedDecision: decision })).toBe(false);
  });

  it("offers no review for a rejection a person made", () => {
    expect(canRequestHumanReview({ status: "rejected" })).toBe(false);
    expect(canRequestHumanReview({ status: "rejected", automatedDecision: null })).toBe(false);
  });

  it("offers no review once the application has moved on", () => {
    expect(canRequestHumanReview({ status: "shortlisted", automatedDecision: autoRejectDecision(32, 40, decidedAt) })).toBe(false);
  });

  it("counts a review as pending from the request until a person acts", () => {
    const requested = { ...autoRejectDecision(32, 40, decidedAt), reviewRequestedAt: new Date() };
    expect(isHumanReviewPending({ automatedDecision: requested })).toBe(true);
    expect(isHumanReviewPending({ automatedDecision: { ...requested, reviewedAt: new Date() } })).toBe(false);
    expect(isHumanReviewPending({ automatedDecision: autoRejectDecision(32, 40, decidedAt) })).toBe(false);
  });
});

describe("stampHumanReview", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { stampHumanReview } = require("@/lib/hiring/automatedDecision") as typeof import("@/lib/hiring/automatedDecision");
  const decidedAt = new Date("2026-10-28T10:00:00Z");

  it("marks the first staff move after a request as the human review", () => {
    const app = { automatedDecision: { ...autoRejectDecision(32, 40, decidedAt), reviewRequestedAt: new Date() } };
    const now = new Date("2026-10-29T08:00:00Z");
    stampHumanReview(app, "staff_1", now);
    expect(app.automatedDecision).toMatchObject({ reviewedAt: now, reviewedBy: "staff_1" });
  });

  it("leaves an application nobody asked about alone", () => {
    const app = { automatedDecision: autoRejectDecision(32, 40, decidedAt) };
    stampHumanReview(app, "staff_1");
    expect(app.automatedDecision).not.toHaveProperty("reviewedAt");
  });

  it("keeps the first reviewer", () => {
    const first = new Date("2026-10-29T08:00:00Z");
    const app = { automatedDecision: { ...autoRejectDecision(32, 40, decidedAt), reviewRequestedAt: new Date(), reviewedAt: first } };
    stampHumanReview(app, "staff_2");
    expect(app.automatedDecision.reviewedAt).toBe(first);
  });
});
