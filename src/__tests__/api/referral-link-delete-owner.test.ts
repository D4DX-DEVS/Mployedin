/**
 * @jest-environment node
 *
 * DELETE /api/referral-links/[id] hard-deletes an unused link. A super agent
 * could delete any team agent's link, including one the agent had already
 * posted in their groups (2026-10-13). Only the creator or an admin may delete;
 * the super agent can still pause a team link with PATCH.
 */
import { NextRequest } from "next/server";

const AGENT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SA = "dddddddddddddddddddddddd";
const LINK_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, rc?: { params?: Promise<Record<string, string>> }) =>
      h(req, currentCtx, rc?.params ? await rc.params : undefined),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
// The super agent oversees the creating agent: team access is not enough to delete.
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: () => ({ select: () => ({ lean: () => Promise.resolve([{ userId: AGENT }]) }) }) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: "s1", agentIds: ["a1"] }) }) }) },
}));

const deleteOne = jest.fn().mockResolvedValue(undefined);
let creator = AGENT;
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: {
    findById: () =>
      Promise.resolve({
        _id: LINK_ID,
        code: "MPL-TEST",
        createdBy: { toString: () => creator },
        registrations: [],
        usedCount: 0,
        deleteOne,
      }),
  },
}));

import { DELETE } from "@/app/api/referral-links/[id]/route";

async function del(ctx: Record<string, unknown>) {
  currentCtx = { locale: "en", ...ctx };
  return DELETE(new NextRequest(`http://localhost/api/referral-links/${LINK_ID}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: LINK_ID }),
  } as never);
}

beforeEach(() => {
  deleteOne.mockClear();
  creator = AGENT;
});

it("refuses a super agent deleting their team agent's link", async () => {
  expect((await del({ userId: SA, role: "super_agent" })).status).toBe(403);
  expect(deleteOne).not.toHaveBeenCalled();
});

it("lets a super agent delete their own unused link", async () => {
  creator = SA;
  expect((await del({ userId: SA, role: "super_agent" })).status).toBe(200);
  expect(deleteOne).toHaveBeenCalledTimes(1);
});

it("lets the creating agent and an admin delete", async () => {
  expect((await del({ userId: AGENT, role: "agent" })).status).toBe(200);
  expect((await del({ userId: "eeeeeeeeeeeeeeeeeeeeeeee", role: "admin" })).status).toBe(200);
  expect(deleteOne).toHaveBeenCalledTimes(2);
});
