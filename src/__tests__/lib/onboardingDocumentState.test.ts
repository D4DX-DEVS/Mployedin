/**
 * @jest-environment node
 *
 * One reading of "where is this requested document" shared by the candidate's
 * page, the employer's page and the routes. The stored status alone was not
 * enough: a signed document with no file, or an uploaded one still missing its
 * signature, each looked finished to one side and unfinished to the other.
 */
import { onboardingDocState } from "@/lib/onboarding/documentState";
import { onboardingUpdateSchema } from "@/lib/validators/onboarding";

describe("onboardingDocState", () => {
  it("asks for the file when nothing was uploaded", () => {
    expect(onboardingDocState({ status: "requested" })).toEqual({
      stage: "needs_action", needsFile: true, needsSignature: false,
    });
  });

  it("is in review once the file is in and no signature is required", () => {
    expect(onboardingDocState({ status: "submitted", url: "https://files/x.pdf" }).stage).toBe("in_review");
  });

  it("still needs the candidate when the file is in but the signature is not", () => {
    expect(onboardingDocState({ status: "submitted", url: "https://files/x.pdf", requiresSignature: true })).toEqual({
      stage: "needs_action", needsFile: false, needsSignature: true,
    });
  });

  it("still needs the candidate when signed without a file", () => {
    const state = onboardingDocState({
      status: "signed", requiresSignature: true, signature: { fullName: "A B", signedAt: "2026-11-01" },
    });
    expect(state).toEqual({ stage: "needs_action", needsFile: true, needsSignature: false });
  });

  it("is in review when both the file and the signature are in", () => {
    const state = onboardingDocState({
      status: "signed", url: "https://files/x.pdf", requiresSignature: true, signature: { fullName: "A B" },
    });
    expect(state.stage).toBe("in_review");
  });

  it("is approved whatever else is stored", () => {
    expect(onboardingDocState({ status: "approved" })).toEqual({
      stage: "approved", needsFile: false, needsSignature: false,
    });
  });
});

describe("onboardingUpdateSchema due dates", () => {
  const day = 24 * 60 * 60 * 1000;

  it("rejects a task due date in the past", () => {
    const past = new Date(Date.now() - 10 * day).toISOString();
    expect(onboardingUpdateSchema.safeParse({ addTask: { title: "Laptop", dueDate: past } }).success).toBe(false);
  });

  it("rejects a document due date in the past", () => {
    const past = new Date(Date.now() - 10 * day).toISOString();
    const result = onboardingUpdateSchema.safeParse({ addDocument: { name: "Passport", dueDate: past } });
    expect(result.success).toBe(false);
  });

  it("accepts today, sent as UTC midnight, and future days", () => {
    const todayUtcMidnight = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const future = new Date(Date.now() + 10 * day).toISOString();
    expect(onboardingUpdateSchema.safeParse({ addTask: { title: "Laptop", dueDate: todayUtcMidnight } }).success).toBe(true);
    expect(onboardingUpdateSchema.safeParse({ addDocument: { name: "Passport", dueDate: future } }).success).toBe(true);
  });

  it("needs a reason when a document is sent back", () => {
    expect(onboardingUpdateSchema.safeParse({ document: { index: 0, status: "requested" } }).success).toBe(false);
    expect(
      onboardingUpdateSchema.safeParse({ document: { index: 0, status: "requested", reviewNote: "Scan is cut off" } }).success,
    ).toBe(true);
    expect(onboardingUpdateSchema.safeParse({ document: { index: 0, status: "approved" } }).success).toBe(true);
  });
});
