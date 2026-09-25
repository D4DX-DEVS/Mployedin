/**
 * @jest-environment node
 *
 * GET /api/job-seekers/[id]/availability returned a candidate's busy windows —
 * including other companies' interviews — to any employer or agent who knew the
 * seeker id (audit 2026-09-24, SEC-07). Only the hiring side of one of the
 * candidate's applications may read it now.
 */
import { NextRequest } from "next/server";

const SEEKER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const MY_EMP = "bbbbbbbbbbbbbbbbbbbbbbbb";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, rc?: { params?: Promise<Record<string, string>> }) =>
      h(req, currentCtx, rc?.params ? await rc.params : undefined),
}));
jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});

const getScopedEmployerIds = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getScopedEmployerIds: (...a: unknown[]) => getScopedEmployerIds(...a),
}));
const getMemberJobRestriction = jest.fn();
jest.mock("@/lib/permissions/team", () => ({
  getMemberJobRestriction: (...a: unknown[]) => getMemberJobRestriction(...a),
}));
const appExists = jest.fn();
jest.mock("@/models/Application", () => ({ __esModule: true, default: { exists: (...a: unknown[]) => appExists(...a) } }));
const seekerFind = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => {
      seekerFind(...a);
      return { select: () => ({ lean: () => Promise.resolve({ settings: { instantBooking: true, timezone: "Asia/Dubai" } }) }) };
    },
  },
}));
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }) },
}));

import { GET } from "@/app/api/job-seekers/[id]/availability/route";

function get() {
  return GET(new NextRequest(`http://localhost/api/job-seekers/${SEEKER}/availability?date=2026-10-01`), {
    params: Promise.resolve({ id: SEEKER }),
  } as never);
}

beforeEach(() => {
  seekerFind.mockClear();
  appExists.mockReset();
  getScopedEmployerIds.mockReset();
  getMemberJobRestriction.mockReset().mockResolvedValue(null);
});

it("refuses an employer the candidate never applied to, before reading the seeker", async () => {
  currentCtx = { userId: "1", role: "employer" };
  getScopedEmployerIds.mockResolvedValue([MY_EMP]);
  appExists.mockResolvedValue(null);
  expect((await get()).status).toBe(403);
  expect(appExists).toHaveBeenCalledWith({ jobSeekerId: SEEKER, employerId: { $in: [MY_EMP] } });
  expect(seekerFind).not.toHaveBeenCalled();
});

it("refuses a caller with an empty scope (e.g. an agent with no employers)", async () => {
  currentCtx = { userId: "2", role: "agent" };
  getScopedEmployerIds.mockResolvedValue([]);
  expect((await get()).status).toBe(403);
});

it("serves the employer the candidate applied to", async () => {
  currentCtx = { userId: "3", role: "employer" };
  getScopedEmployerIds.mockResolvedValue([MY_EMP]);
  appExists.mockResolvedValue({ _id: "x" });
  expect((await get()).status).toBe(200);
});

it("serves admin without a relationship check", async () => {
  currentCtx = { userId: "4", role: "admin" };
  expect((await get()).status).toBe(200);
  expect(appExists).not.toHaveBeenCalled();
});

it("limits a job-restricted colleague to candidates of their own jobs", async () => {
  const MEMBER = { actorId: "9", companyId: MY_EMP, companyRoles: ["hiring_manager"], permissions: {}, jobAccess: ["job-a"] };
  currentCtx = { userId: "owner", role: "employer", member: MEMBER };
  getScopedEmployerIds.mockResolvedValue([MY_EMP]);
  getMemberJobRestriction.mockResolvedValue(["job-a"]);
  appExists.mockResolvedValue(null); // applied to the company, but only to job B
  expect((await get()).status).toBe(403);
  expect(getMemberJobRestriction).toHaveBeenCalledWith(currentCtx, MY_EMP);
  expect(appExists).toHaveBeenCalledWith({ jobSeekerId: SEEKER, employerId: { $in: [MY_EMP] }, jobId: { $in: ["job-a"] } });
});
