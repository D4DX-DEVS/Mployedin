/**
 * @jest-environment node
 *
 * Assembling the invitation email: who it goes to, what the .ics says, and the
 * response link that makes the candidate's answer actually reach the app.
 *
 * Sending must never take the booking down with it — the interview is already
 * written by the time this runs.
 */
interface SentAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}
interface SentEmail {
  to: string;
  subject: string;
  html: string;
  attachments: SentAttachment[];
}

const sendEmail = jest.fn(async (_payload: SentEmail) => ({ messageId: "m1" }));

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (payload: SentEmail) => sendEmail(payload),
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/interviews/responseToken", () => ({
  ...jest.requireActual("@/lib/interviews/responseToken"),
  ensureResponseToken: jest.fn(async () => "tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
}));

let interviewRow: Record<string, unknown> | null = null;

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain(interviewRow)) },
}));

import { sendInterviewInvite } from "@/lib/interviews/sendInvite";

const FUTURE = new Date("2026-10-05T06:00:00Z");

function row(over: Record<string, unknown> = {}) {
  return {
    _id: "iv_1",
    scheduledAt: FUTURE,
    duration: 45,
    type: "video",
    meetLink: "https://meet.test/x",
    location: null,
    status: "scheduled",
    icsSequence: 0,
    jobId: { title: "Full Stack Developer" },
    jobSeekerId: { userId: { name: "Sara Kapoor", email: "sara@example.com" } },
    employerId: { companyName: "Acme", userId: { email: "hiring@acme.test" } },
    ...over,
  };
}

describe("sendInterviewInvite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    interviewRow = row();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  it("emails the candidate", async () => {
    await sendInterviewInvite("iv_1", "en");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("sara@example.com");
  });

  it("attaches a calendar invitation", async () => {
    await sendInterviewInvite("iv_1", "en");
    const attachments = sendEmail.mock.calls[0][0].attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toMatch(/\.ics$/);
    expect(attachments[0].contentType).toContain("text/calendar");
    expect(attachments[0].contentType).toContain("method=REQUEST");
  });

  it("puts the response link in both the .ics and the email body", async () => {
    await sendInterviewInvite("iv_1", "en");
    const payload = sendEmail.mock.calls[0][0];
    const expected = "https://app.test/en/interview-response/tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(payload.html).toContain(expected);
    expect(String(payload.attachments[0].content).replace(/\r\n /g, "")).toContain(expected);
  });

  it("sends a cancellation when the interview is cancelled", async () => {
    interviewRow = row({ status: "cancelled", icsSequence: 2 });
    await sendInterviewInvite("iv_1", "en");
    const ics = String(sendEmail.mock.calls[0][0].attachments[0].content);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("SEQUENCE:2");
    expect(sendEmail.mock.calls[0][0].attachments[0].contentType).toContain("method=CANCEL");
  });

  it("does nothing when the candidate has no email to write to", async () => {
    interviewRow = row({ jobSeekerId: { userId: { name: "Sara", email: null } } });
    await expect(sendInterviewInvite("iv_1", "en")).resolves.toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns false rather than throwing when the interview is gone", async () => {
    interviewRow = null;
    await expect(sendInterviewInvite("missing", "en")).resolves.toBe(false);
  });

  it("swallows a send failure — the interview is already booked", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    await expect(sendInterviewInvite("iv_1", "en")).resolves.toBe(false);
  });
});
