/**
 * @jest-environment node
 *
 * A Premium job seeker's applications are priority (client decision
 * 2026-10-12). Granting or taking back Premium turns their applications with
 * them, so the reviewer's order and badge follow the seeker.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, params?: Record<string, string>) =>
    handler(req, { userId: "agent-user", role: "agent", locale: "en" }, params ?? {}),
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn() }));
const canStaffAccessSeeker = jest.fn();
jest.mock("@/lib/jobSeeker/staffAccess", () => ({ canStaffAccessSeeker: (...a: unknown[]) => canStaffAccessSeeker(...a) }));

const seekerFindById = jest.fn();
const seekerUpdateOne = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => seekerFindById(...a),
    updateOne: (...a: unknown[]) => seekerUpdateOne(...a),
  },
}));
const applicationUpdateMany = jest.fn();
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { updateMany: (...a: unknown[]) => applicationUpdateMany(...a) },
}));

import { POST } from "@/app/api/job-seekers/[id]/premium/route";

const SEEKER_ID = "64b0000000000000000000c1";
const call = (premium: boolean) =>
  (POST as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(
    new NextRequest(`http://t/api/job-seekers/${SEEKER_ID}/premium`, { method: "POST", body: JSON.stringify({ premium }) }),
    { id: SEEKER_ID },
  );
const seeker = (badges: string[]) => ({ select: () => ({ lean: async () => ({ _id: SEEKER_ID, badges }) }) });

beforeEach(() => {
  jest.clearAllMocks();
  canStaffAccessSeeker.mockResolvedValue(true);
  seekerUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  applicationUpdateMany.mockResolvedValue({ modifiedCount: 2 });
});

it("granting Premium makes the seeker's applications priority", async () => {
  seekerFindById.mockReturnValue(seeker([]));
  expect((await call(true)).status).toBe(200);
  expect(applicationUpdateMany).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID }, { $set: { isPriority: true } });
});

it("taking Premium back takes the priority back", async () => {
  seekerFindById.mockReturnValue(seeker(["premium"]));
  expect((await call(false)).status).toBe(200);
  expect(applicationUpdateMany).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID }, { $set: { isPriority: false } });
});

it("touches nothing for a seeker the agent may only view", async () => {
  seekerFindById.mockReturnValue(seeker([]));
  canStaffAccessSeeker.mockResolvedValue(false);
  expect((await call(true)).status).toBe(403);
  expect(applicationUpdateMany).not.toHaveBeenCalled();
});
