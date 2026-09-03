/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const SEEKER_USER = "64c000000000000000000001";
const JOB_ID = "64c000000000000000000002";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: SEEKER_USER, role: "job_seeker", locale: "en" }, params)),
}));

const savedJobCreate = jest.fn().mockResolvedValue({ _id: "saved_1" });
jest.mock("@/models/SavedJob", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create: (...args: unknown[]) => savedJobCreate(...args),
    deleteOne: jest.fn(),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "seeker_1" }) }),
    }),
  },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    // An active job with no legacy poster.approvalStatus — the only thing that
    // should gate saving is status.
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: JOB_ID, status: "active" }) }),
    }),
  },
}));

describe("POST /api/jobs/[id]/save — saving depends on status only", () => {
  it("saves an active job that carries no approval status", async () => {
    const { POST } = await import("@/app/api/jobs/[id]/save/route");
    const res = await POST(
      new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}/save`, { method: "POST" }),
      { params: Promise.resolve({ id: JOB_ID }) },
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ saved: true });
    expect(savedJobCreate).toHaveBeenCalledTimes(1);
  });
});
