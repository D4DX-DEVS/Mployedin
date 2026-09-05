/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

const ADMIN_SELF_ID = "507f1f77bcf86cd799439099";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>) => {
    return async (req: NextRequest) => {
      try {
        return await handler(req, { userId: "507f1f77bcf86cd799439099", role: "admin", locale: "en" });
      } catch (err) {
        // Mirrors the real withAuth: validateBody() throws a NextResponse on validation failure.
        if (err instanceof NextResponse) return err;
        throw err;
      }
    };
  },
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const updateOneMock = jest.fn();
const deleteOneMock = jest.fn();
const findByIdMock = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    updateOne: (...args: unknown[]) => updateOneMock(...args),
    deleteOne: (...args: unknown[]) => deleteOneMock(...args),
    findById: (...args: unknown[]) => findByIdMock(...args),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

const deactivateEmployerAccountMock = jest.fn().mockResolvedValue({ employerId: "emp_1", affectedJobs: 1 });
const reactivateEmployerAccountMock = jest.fn().mockResolvedValue({ employerId: "emp_1", affectedJobs: 1 });
jest.mock("@/lib/employers/accountStatus", () => ({
  deactivateEmployerAccount: (...args: unknown[]) => deactivateEmployerAccountMock(...args),
  reactivateEmployerAccount: (...args: unknown[]) => reactivateEmployerAccountMock(...args),
}));

jest.mock("@/models/Agent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));
jest.mock("bcryptjs", () => ({ hash: jest.fn() }));

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ID_A = "507f1f77bcf86cd799439011";
const ID_B = "507f1f77bcf86cd799439012";

describe("PATCH /api/admin/users (bulk itemized results)", () => {
  let PATCH: (req: NextRequest, ctx?: unknown) => Promise<Response>;

  beforeAll(async () => {
    const route = await import("@/app/api/admin/users/route");
    PATCH = route.PATCH as typeof PATCH;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default target: a non-employer, so the employer job-visibility hook stays out of the way.
    findByIdMock.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: ID_A, role: "job_seeker" }) }) });
  });

  it("reports a mix of updated and skipped rows", async () => {
    updateOneMock
      .mockResolvedValueOnce({ modifiedCount: 1 }) // ID_A: updated
      .mockResolvedValueOnce({ modifiedCount: 0 }); // ID_B: not found / already in state

    const res = await PATCH(
      makePatchRequest({ ids: [ID_A, ID_B], action: "deactivate" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.affected).toBe(1);
    expect(data.total).toBe(2);
    expect(data.results).toEqual([
      { userId: ID_A, status: "updated" },
      { userId: ID_B, status: "skipped", reason: "Not found or already in that state" },
    ]);
  });

  it("rejects the whole batch when an id isn't a valid ObjectId (schema-level guard)", async () => {
    const res = await PATCH(
      makePatchRequest({ ids: [ID_A, "not-a-valid-id"], action: "deactivate" })
    );
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it("skips the caller's own id for destructive actions", async () => {
    const res = await PATCH(
      makePatchRequest({ ids: [ADMIN_SELF_ID], action: "delete" })
    );
    const data = await res.json();

    expect(data.affected).toBe(0);
    expect(data.results[0]).toEqual({
      userId: ADMIN_SELF_ID,
      status: "skipped",
      reason: "Cannot act on your own account",
    });
    expect(deleteOneMock).not.toHaveBeenCalled();
  });

  it("marks a row as error when the update throws", async () => {
    updateOneMock.mockRejectedValueOnce(new Error("db exploded"));

    const res = await PATCH(
      makePatchRequest({ ids: [ID_A], action: "activate" })
    );
    const data = await res.json();

    expect(data.results[0]).toEqual({ userId: ID_A, status: "error", reason: "Unexpected error" });
  });

  it("rejects setRole without a role", async () => {
    const res = await PATCH(makePatchRequest({ ids: [ID_A], action: "setRole" }));
    expect(res.status).toBe(400);
  });

  it("deactivating an employer also takes their live jobs off the market", async () => {
    findByIdMock.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: ID_A, role: "employer" }) }) });
    updateOneMock.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await PATCH(makePatchRequest({ ids: [ID_A], action: "deactivate" }));

    expect(res.status).toBe(200);
    expect(deactivateEmployerAccountMock).toHaveBeenCalledWith(ID_A);
    expect(reactivateEmployerAccountMock).not.toHaveBeenCalled();
  });

  it("reactivating an employer brings those jobs back", async () => {
    findByIdMock.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: ID_A, role: "employer" }) }) });
    updateOneMock.mockResolvedValueOnce({ modifiedCount: 1 });

    await PATCH(makePatchRequest({ ids: [ID_A], action: "activate" }));

    expect(reactivateEmployerAccountMock).toHaveBeenCalledWith(ID_A);
  });

  it("does not touch jobs when the deactivated user is not an employer", async () => {
    findByIdMock.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: ID_A, role: "job_seeker" }) }) });
    updateOneMock.mockResolvedValueOnce({ modifiedCount: 1 });

    await PATCH(makePatchRequest({ ids: [ID_A], action: "deactivate" }));

    expect(deactivateEmployerAccountMock).not.toHaveBeenCalled();
  });
});
