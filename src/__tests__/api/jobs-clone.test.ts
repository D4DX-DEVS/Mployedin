/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const SOURCE_JOB = "64b000000000000000000003";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));

const jobCreateMock = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: SOURCE_JOB,
        employerId: EMPLOYER_ID,
        agentId: "64b000000000000000000009",
        title: "Senior Recruiter",
        description: "Recruit people, at length, for the whole team.",
        requirements: { skills: ["Sourcing"] },
        salary: { min: 1000, max: 2000, currency: "AED" },
        location: { country: "UAE", city: "Dubai" },
        tags: [],
        vacancies: 1,
        workflowMode: "manual",
      }),
    }),
    create: (...args: unknown[]) => jobCreateMock(...args),
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER_ID, agentId: null }) }),
    }),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

describe("POST /api/jobs/[id]/clone — no approval state on clones", () => {
  it("creates the clone as a draft without any poster approval status", async () => {
    jobCreateMock.mockResolvedValue({ _id: "64b000000000000000000010", status: "draft" });
    const { POST } = await import("@/app/api/jobs/[id]/clone/route");

    const res = await POST(
      new NextRequest(`http://localhost:3000/api/jobs/${SOURCE_JOB}/clone`, { method: "POST" }),
      { params: Promise.resolve({ id: SOURCE_JOB }) },
    );

    expect(res.status).toBe(201);
    const created = jobCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(created.status).toBe("draft");
    expect(created).not.toHaveProperty("poster");
    expect(created).not.toHaveProperty("poster.approvalStatus");
  });
});
