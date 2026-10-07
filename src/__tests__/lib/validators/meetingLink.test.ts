/**
 * @jest-environment node
 *
 * QA EMP-007 (2026-10-06): "not a link" was accepted as an interview meeting
 * link, stored, and sent to the candidate. Every schema that takes a link now
 * rejects it; blank still means "generate a video room".
 */
import { interviewBulkSchema, interviewCreateSchema, interviewUpdateSchema, meetingLinkSchema } from "@/lib/validators/interviews";

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const APP_ID = "651000000000000000000c01";

describe("meetingLinkSchema", () => {
  it.each([
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["  https://us02web.zoom.us/j/123456  ", "https://us02web.zoom.us/j/123456"],
    ["", ""],
  ])("accepts %j", (input, stored) => {
    expect(meetingLinkSchema.parse(input)).toBe(stored);
  });

  it.each(["not a link", "javascript:alert(1)", "ftp://files.example.com", "meet", "http://"])("rejects %j", (input) => {
    expect(meetingLinkSchema.safeParse(input).success).toBe(false);
  });
});

describe("interview schemas use it", () => {
  it("create refuses a bad link and keeps a blank one", () => {
    expect(interviewCreateSchema.safeParse({ applicationId: APP_ID, scheduledAt: FUTURE, meetLink: "not a link" }).success).toBe(false);
    expect(interviewCreateSchema.safeParse({ applicationId: APP_ID, scheduledAt: FUTURE, meetLink: "" }).success).toBe(true);
    expect(interviewCreateSchema.safeParse({ applicationId: APP_ID, scheduledAt: FUTURE }).success).toBe(true);
  });

  it("update refuses a bad link", () => {
    expect(interviewUpdateSchema.safeParse({ meetLink: "not a link" }).success).toBe(false);
  });

  it("bulk refuses a bad link", () => {
    const base = { candidates: [{ jobSeekerId: APP_ID }], scheduledAt: FUTURE };
    expect(interviewBulkSchema.safeParse({ ...base, meetLink: "not a link" }).success).toBe(false);
    expect(interviewBulkSchema.safeParse({ ...base, meetLink: "meet.google.com/x" }).success).toBe(true);
  });
});
