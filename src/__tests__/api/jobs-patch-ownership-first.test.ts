/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

const OWNER_EMPLOYER = "651000000000000000000001";
const OTHER_EMPLOYER = "651000000000000000000002";
const JOB_ID = "651000000000000000000003";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockResolvedValue({ _id: JOB_ID, employerId: OWNER_EMPLOYER, agentId: null, status: "active", save: jest.fn() }),
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: OTHER_EMPLOYER }) }),
    }),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

describe("PATCH /api/jobs/[id] — ownership is decided before the body is validated", () => {
  it("returns 403 (not 400) to a non-owner who sends an invalid body", async () => {
    const { patchHandler } = await import("@/app/api/jobs/[id]/handlers");
    const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: 123 }),
    });

    let res: Response;
    try {
      res = await patchHandler(req, { userId: "651000000000000000000009", role: "employer", locale: "en" }, { id: JOB_ID });
    } catch (err) {
      if (!(err instanceof NextResponse)) throw err;
      res = err;
    }

    expect(res.status).toBe(403);
  });
});
