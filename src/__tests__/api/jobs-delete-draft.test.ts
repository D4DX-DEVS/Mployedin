/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const EMPLOYER_ID = "652000000000000000000001";
const JOB_ID = "652000000000000000000003";

const save = jest.fn().mockResolvedValue(undefined);
const job = { _id: JOB_ID, employerId: EMPLOYER_ID, agentId: null, status: "draft", title: "Incomplete draft", deletedAt: null as Date | null, save };

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => Promise.resolve(job)) } }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER_ID }) }),
    }),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

describe("DELETE /api/jobs/[id] — soft delete of an incomplete draft", () => {
  it("saves without schema validation so empty required fields cannot block the delete", async () => {
    const { deleteHandler } = await import("@/app/api/jobs/[id]/handlers");
    const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`, { method: "DELETE" });
    const res = await deleteHandler(req, { userId: "652000000000000000000009", role: "employer", locale: "en" }, { id: JOB_ID });

    expect(res.status).toBe(200);
    expect(job.deletedAt).toBeInstanceOf(Date);
    expect(job.status).toBe("draft");
    expect(save).toHaveBeenCalledWith({ validateBeforeSave: false });
  });
});
