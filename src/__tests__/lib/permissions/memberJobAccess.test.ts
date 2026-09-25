/**
 * @jest-environment node
 *
 * A colleague's per-job restriction (CompanyUser.jobAccess) is read from THEIR
 * row via ctx.member.actorId — never from ctx.userId, which withAuth swaps to
 * the owner (audit 2026-09-24, SEC-04).
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/employers/company-membership", () => ({ ensureEmployerOwnerMembership: jest.fn() }));

let row: Record<string, unknown> | null = null;
const findOne = jest.fn();
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: (...a: unknown[]) => {
      findOne(...a);
      return { select: () => ({ lean: () => Promise.resolve(row) }) };
    },
  },
}));

import { getMemberJobRestriction, memberMayAccessJob } from "@/lib/permissions/team";

const JOB_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const JOB_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const colleague = { userId: "owner-id", member: { actorId: "colleague-id" } };

beforeEach(() => {
  findOne.mockClear();
  row = null;
});

it("owner and tenant view are never restricted and need no lookup", async () => {
  expect(await getMemberJobRestriction({ userId: "owner-id" }, "co")).toBeNull();
  expect(await memberMayAccessJob({ userId: "owner-id" }, "co", JOB_B)).toBe(true);
  expect(findOne).not.toHaveBeenCalled();
});

it("reads the colleague's own row and confines them to their jobs", async () => {
  row = { companyRole: "hiring_manager", companyRoles: ["hiring_manager"], jobAccess: [JOB_A] };
  expect(await memberMayAccessJob(colleague, "co", JOB_A)).toBe(true);
  expect(await memberMayAccessJob(colleague, "co", JOB_B)).toBe(false);
  expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: "colleague-id", status: "active" }));
});

it("an empty jobAccess or an admin role means every job", async () => {
  row = { companyRole: "hiring_manager", companyRoles: ["hiring_manager"], jobAccess: [] };
  expect(await memberMayAccessJob(colleague, "co", JOB_B)).toBe(true);
  row = { companyRole: "admin", companyRoles: ["admin"], jobAccess: [JOB_A] };
  expect(await memberMayAccessJob(colleague, "co", JOB_B)).toBe(true);
});

it("a colleague with no active membership reaches no job", async () => {
  row = null;
  expect(await getMemberJobRestriction(colleague, "co")).toEqual([]);
  expect(await memberMayAccessJob(colleague, "co", JOB_A)).toBe(false);
});
