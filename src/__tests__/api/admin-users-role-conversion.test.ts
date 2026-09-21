/**
 * @jest-environment node
 *
 * An admin role conversion used to DELETE the outgoing profile document.
 * That was destructive in both directions:
 *   - seeker to anything binned the CV, skills and onboarding state for good,
 *     and left existing applications pointing at a JobSeeker id that no longer
 *     existed (converting back handed the person a blank profile);
 *   - employer to anything deleted the Employer while leaving that company's
 *     jobs `status: "active"` with a dangling `employerId` - still on the
 *     public board, still taking applications, with no owner left to pull them.
 *
 * These tests pin the replacement behaviour: archive, never delete.
 */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const ADMIN_SELF_ID = "507f1f77bcf86cd799439099";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (
    handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>,
  ) => {
    return async (req: NextRequest) => {
      try {
        return await handler(req, { userId: ADMIN_SELF_ID, role: "admin", locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    };
  },
}));

const logActivityMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: (...args: unknown[]) => logActivityMock(...args),
}));

const notifyRoleChangedMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyRoleChanged: (...args: unknown[]) => notifyRoleChangedMock(...args),
}));

const userUpdateOneMock = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const userFindByIdMock = jest.fn();
const userFindByIdAndUpdateMock = jest.fn();
const userFindOneMock = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    updateOne: (...a: unknown[]) => userUpdateOneMock(...a),
    findById: (...a: unknown[]) => userFindByIdMock(...a),
    findByIdAndUpdate: (...a: unknown[]) => userFindByIdAndUpdateMock(...a),
    deleteOne: jest.fn(),
    findOne: (...a: unknown[]) => userFindOneMock(...a),
    find: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(5),
  },
}));

const employerExistsMock = jest.fn();
const employerUpdateOneMock = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const employerCreateMock = jest.fn().mockResolvedValue({});
const employerDeleteOneMock = jest.fn();
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    exists: (...a: unknown[]) => employerExistsMock(...a),
    updateOne: (...a: unknown[]) => employerUpdateOneMock(...a),
    create: (...a: unknown[]) => employerCreateMock(...a),
    deleteOne: (...a: unknown[]) => employerDeleteOneMock(...a),
  },
}));

const seekerExistsMock = jest.fn();
const seekerUpdateOneMock = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const seekerCreateMock = jest.fn().mockResolvedValue({});
const seekerDeleteOneMock = jest.fn();
const seekerModel = {
  exists: (...a: unknown[]) => seekerExistsMock(...a),
  updateOne: (...a: unknown[]) => seekerUpdateOneMock(...a),
  create: (...a: unknown[]) => seekerCreateMock(...a),
  deleteOne: (...a: unknown[]) => seekerDeleteOneMock(...a),
};
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: seekerModel,
  JobSeeker: seekerModel,
}));

const deactivateEmployerAccountMock = jest.fn().mockResolvedValue({ employerId: "emp_1", affectedJobs: 3 });
const reactivateEmployerAccountMock = jest.fn().mockResolvedValue({ employerId: "emp_1", affectedJobs: 3 });
jest.mock("@/lib/employers/accountStatus", () => ({
  deactivateEmployerAccount: (...a: unknown[]) => deactivateEmployerAccountMock(...a),
  reactivateEmployerAccount: (...a: unknown[]) => reactivateEmployerAccountMock(...a),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { exists: jest.fn(), updateOne: jest.fn(), create: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { exists: jest.fn(), updateOne: jest.fn(), create: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock("bcryptjs", () => ({ hash: jest.fn() }));

const TARGET_ID = "507f1f77bcf86cd799439011";

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Shapes `User.findById(...).select(...).lean()` for the pre-update snapshot. */
function mockOldUser(doc: Record<string, unknown> | null) {
  userFindByIdMock.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }),
  });
}

function mockUpdatedUser(doc: Record<string, unknown>) {
  userFindByIdAndUpdateMock.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }),
  });
}

describe("PATCH /api/admin/users - role conversion archives, never deletes", () => {
  let PATCH: (req: NextRequest, ctx?: unknown) => Promise<Response>;

  beforeAll(async () => {
    const route = await import("@/app/api/admin/users/route");
    PATCH = route.PATCH as typeof PATCH;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userUpdateOneMock.mockResolvedValue({ modifiedCount: 1 });
    employerUpdateOneMock.mockResolvedValue({ modifiedCount: 1 });
    seekerUpdateOneMock.mockResolvedValue({ modifiedCount: 1 });
  });

  it("job_seeker to employer keeps the JobSeeker profile and stamps it archived", async () => {
    mockOldUser({ _id: TARGET_ID, role: "job_seeker", name: "Sam", email: "sam@example.com" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", name: "Sam", email: "sam@example.com" });
    employerExistsMock.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ userId: TARGET_ID, role: "employer" }));
    expect(res.status).toBe(200);

    // The CV, skills and application history survive the conversion.
    expect(seekerDeleteOneMock).not.toHaveBeenCalled();
    expect(seekerUpdateOneMock).toHaveBeenCalledWith(
      { userId: TARGET_ID },
      { $set: { roleArchivedAt: expect.any(Date) } },
    );
  });

  it("employer to job_seeker pauses the company's live jobs instead of orphaning them", async () => {
    mockOldUser({ _id: TARGET_ID, role: "employer", name: "Acme", email: "acme@example.com" });
    mockUpdatedUser({ _id: TARGET_ID, role: "job_seeker", name: "Acme", email: "acme@example.com" });
    seekerExistsMock.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ userId: TARGET_ID, role: "job_seeker" }));
    expect(res.status).toBe(200);

    // This is the call that takes their jobs off the public board.
    expect(deactivateEmployerAccountMock).toHaveBeenCalledWith(TARGET_ID);
    expect(employerDeleteOneMock).not.toHaveBeenCalled();
    expect(employerUpdateOneMock).toHaveBeenCalledWith(
      { userId: TARGET_ID },
      { $set: { roleArchivedAt: expect.any(Date) } },
    );
  });

  it("converting back to employer un-archives the profile and resumes the paused jobs", async () => {
    mockOldUser({ _id: TARGET_ID, role: "job_seeker", name: "Acme", email: "acme@example.com" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", name: "Acme", email: "acme@example.com" });
    employerExistsMock.mockResolvedValue({ _id: "emp_1" });

    await PATCH(patchRequest({ userId: TARGET_ID, role: "employer" }));

    expect(employerCreateMock).not.toHaveBeenCalled(); // no duplicate profile
    expect(employerUpdateOneMock).toHaveBeenCalledWith(
      { userId: TARGET_ID },
      { $set: { roleArchivedAt: null } },
    );
    expect(reactivateEmployerAccountMock).toHaveBeenCalledWith(TARGET_ID);
  });

  it("a brand-new employer profile is flagged as an unconfirmed conversion", async () => {
    mockOldUser({ _id: TARGET_ID, role: "job_seeker", name: "Sam", email: "sam@example.com" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", name: "Sam", email: "sam@example.com" });
    employerExistsMock.mockResolvedValue(null);

    await PATCH(patchRequest({ userId: TARGET_ID, role: "employer" }));

    expect(employerCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ createdVia: "role_conversion", profileConfirmedAt: null }),
    );
  });

  it("records the previous role in the audit trail and tells the user", async () => {
    mockOldUser({ _id: TARGET_ID, role: "job_seeker", name: "Sam", email: "sam@example.com" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", name: "Sam", email: "sam@example.com" });
    employerExistsMock.mockResolvedValue(null);

    await PATCH(patchRequest({ userId: TARGET_ID, role: "employer" }));

    const entry = logActivityMock.mock.calls.at(-1)?.[0];
    expect(entry.action).toBe("user.role_change");
    // `after` on its own could not say what the role had been.
    expect(entry.changes.before.role).toBe("job_seeker");
    expect(entry.changes.after.role).toBe("employer");
    expect(entry.meta).toMatchObject({ fromRole: "job_seeker", toRole: "employer" });

    expect(notifyRoleChangedMock).toHaveBeenCalledWith(TARGET_ID, "job_seeker", "employer");
  });

  it("bulk setRole resets permissions, so a custom-permission user cannot carry grants across", async () => {
    mockOldUser({ _id: TARGET_ID, role: "agent", name: "Sam", email: "sam@example.com" });
    employerExistsMock.mockResolvedValue(null);

    await PATCH(patchRequest({ ids: [TARGET_ID], action: "setRole", role: "employer" }));

    expect(userUpdateOneMock).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      {
        $set: { role: "employer", permissionMode: "role_default" },
        $unset: { customPermissions: "" },
      },
    );
  });
});

/**
 * The single-user PATCH cleared `customPermissions` by assigning `undefined`
 * to it, which Mongoose strips out of the update entirely — so switching a
 * user back to role defaults, or changing their role, left the old map on the
 * document. It was inert (canAccess only reads it in custom mode), but the
 * permission editor prefilled from it the next time custom mode was enabled,
 * offering an admin a map built for a role the user no longer has.
 */
describe("PATCH /api/admin/users - leaving custom mode clears the map", () => {
  let PATCH: (req: NextRequest, ctx?: unknown) => Promise<Response>;

  beforeAll(async () => {
    const route = await import("@/app/api/admin/users/route");
    PATCH = route.PATCH as typeof PATCH;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    employerExistsMock.mockResolvedValue({ _id: "emp_1" });
  });

  it("unsets customPermissions when the mode goes back to role_default", async () => {
    mockOldUser({ _id: TARGET_ID, role: "agent", permissionMode: "custom" });
    mockUpdatedUser({ _id: TARGET_ID, role: "agent", permissionMode: "role_default" });

    await PATCH(patchRequest({ userId: TARGET_ID, permissionMode: "role_default" }));

    const [, update] = userFindByIdAndUpdateMock.mock.calls.at(-1)!;
    expect(update.$set).toMatchObject({ permissionMode: "role_default" });
    expect(update.$set).not.toHaveProperty("customPermissions");
    expect(update.$unset).toEqual({ customPermissions: "" });
  });

  it("unsets customPermissions when the role changes", async () => {
    mockOldUser({ _id: TARGET_ID, role: "agent", permissionMode: "custom" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", permissionMode: "role_default" });

    await PATCH(patchRequest({ userId: TARGET_ID, role: "employer" }));

    const [, update] = userFindByIdAndUpdateMock.mock.calls.at(-1)!;
    expect(update.$set).toMatchObject({ role: "employer", permissionMode: "role_default" });
    expect(update.$unset).toEqual({ customPermissions: "" });
  });

  it("writes the map, and no $unset, when custom mode is turned on", async () => {
    mockOldUser({ _id: TARGET_ID, role: "agent", permissionMode: "role_default" });
    mockUpdatedUser({ _id: TARGET_ID, role: "agent", permissionMode: "custom" });

    await PATCH(
      patchRequest({
        userId: TARGET_ID,
        permissionMode: "custom",
        customPermissions: { jobs: ["read"] },
      }),
    );

    const [, update] = userFindByIdAndUpdateMock.mock.calls.at(-1)!;
    expect(update.$set).toMatchObject({ permissionMode: "custom", customPermissions: { jobs: ["read"] } });
    expect(update.$unset).toBeUndefined();
  });
});

/** Shapes `User.findOne(...).select(...).lean()` for the email-conflict check. */
function mockEmailClash(doc: Record<string, unknown> | null) {
  userFindOneMock.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }),
  });
}

describe("PATCH /api/admin/users - editing name and email", () => {
  let PATCH: (req: NextRequest, ctx?: unknown) => Promise<Response>;

  beforeAll(async () => {
    const route = await import("@/app/api/admin/users/route");
    PATCH = route.PATCH as typeof PATCH;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmailClash(null);
  });

  it("saves a name and email change and audits it as a plain user update", async () => {
    mockOldUser({ role: "employer", name: "Old Name", email: "old@example.com" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", name: "New Name", email: "new@example.com" });

    const res = await PATCH(patchRequest({ userId: TARGET_ID, name: "New Name", email: "new@example.com" }));

    expect(res.status).toBe(200);
    expect(userFindByIdAndUpdateMock).toHaveBeenCalledWith(
      TARGET_ID,
      expect.objectContaining({ $set: expect.objectContaining({ name: "New Name", email: "new@example.com" }) }),
      expect.anything(),
    );
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: "user.update" }));
  });

  /* Without this the duplicate reaches Mongo and returns an E11000 the dialog
     can only render as an unexpected error. */
  it("rejects an address that belongs to another account with a 409", async () => {
    mockEmailClash({ _id: "507f1f77bcf86cd799439022" });
    mockOldUser({ role: "employer", email: "old@example.com" });

    const res = await PATCH(patchRequest({ userId: TARGET_ID, email: "taken@example.com" }));

    expect(res.status).toBe(409);
    expect(userFindByIdAndUpdateMock).not.toHaveBeenCalled();
  });

  it("does not run the conflict query when no email is being changed", async () => {
    mockOldUser({ role: "employer", name: "Old Name" });
    mockUpdatedUser({ _id: TARGET_ID, role: "employer", name: "Renamed" });

    const res = await PATCH(patchRequest({ userId: TARGET_ID, name: "Renamed" }));

    expect(res.status).toBe(200);
    expect(userFindOneMock).not.toHaveBeenCalled();
  });
});
