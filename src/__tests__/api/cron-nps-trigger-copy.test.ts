/**
 * @jest-environment node
 */
// The feedback request after an application closes (client check 2026-10-30):
// a seeker who withdrew read "You were withdrawn", the text was English-only
// and the link was pinned to /en.
import { NextRequest } from "next/server";

const SEEKER_USER = "650000000000000000000101";
const apps = [
  { _id: "650000000000000000000201", jobSeekerId: "650000000000000000000301", status: "withdrawn", jobId: { title: "Driver" }, employerId: { companyName: "Acme" } },
  { _id: "650000000000000000000202", jobSeekerId: "650000000000000000000301", status: "hired", jobId: { title: "Driver" }, employerId: { companyName: "Acme" } },
  { _id: "650000000000000000000203", jobSeekerId: "650000000000000000000301", status: "rejected", jobId: { title: "Driver" }, employerId: { companyName: "Acme" } },
];

const lean = (value: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ["limit", "select", "populate"]) q[m] = () => q;
  q.lean = async () => value;
  return q;
};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/lib/security/cron-auth", () => ({ verifyCronRequest: () => null }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: () => lean(apps) } }));
jest.mock("@/models/CandidateNPS", () => ({ CandidateNPS: { find: () => lean([]) } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { find: () => lean([{ _id: "650000000000000000000301", userId: SEEKER_USER }]) },
}));
const notify = jest.fn(async (_p: Record<string, unknown>) => undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (p: Record<string, unknown>) => notify(p) }));

describe("GET /api/cron/nps-trigger — feedback request copy", () => {
  it("names each outcome correctly, localizes by key and links without a locale", async () => {
    const { GET } = await import("@/app/api/cron/nps-trigger/route");
    const res = await GET(new NextRequest("http://localhost/api/cron/nps-trigger"));
    expect(res.status).toBe(200);

    const byApp = new Map(notify.mock.calls.map(([p]) => [String(p.link).split("/")[3], p]));
    const withdrawn = byApp.get("650000000000000000000201")!;
    expect(withdrawn.message).toContain('You withdrew your application for "Driver" at Acme.');
    expect(withdrawn.message).not.toContain("You were withdrawn");
    expect(withdrawn).toMatchObject({
      userId: SEEKER_USER,
      titleKey: "feedbackRequestTitle",
      bodyKey: "feedbackRequestBodyWithdrawn",
      params: { jobTitle: "Driver", companyName: "Acme" },
      link: "/job-seeker/applications/650000000000000000000201/feedback",
    });
    expect(byApp.get("650000000000000000000202")!.bodyKey).toBe("feedbackRequestBodyHired");
    expect(byApp.get("650000000000000000000203")!.bodyKey).toBe("feedbackRequestBodyRejected");
  });

  it("has every key in English and Arabic", () => {
    for (const locale of ["en", "ar"]) {
       
      const m = require(`../../../messages/${locale}.json`).notificationContent;
      for (const key of ["feedbackRequestTitle", "feedbackRequestBodyHired", "feedbackRequestBodyRejected", "feedbackRequestBodyWithdrawn"]) {
        expect(typeof m[key]).toBe("string");
      }
    }
  });
});
