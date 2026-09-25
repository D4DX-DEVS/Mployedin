/**
 * @jest-environment node
 *
 * GET /api/referral-links/[id] returns every registration's name, email and
 * user id. It denied only an agent who was not the creator and an out-of-scope
 * super-agent, so an employer or job seeker holding a link id read it all
 * (audit 2026-09-24, SEC-02). Anyone who is not admin / creator / owning SA
 * must be refused.
 */
import { NextRequest } from "next/server";

const CREATOR = "aaaaaaaaaaaaaaaaaaaaaaaa";
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
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }) } }));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) },
}));
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: {
    findById: () => ({
      populate: () => ({
        lean: () =>
          Promise.resolve({
            _id: LINK_ID,
            createdBy: { _id: CREATOR, name: "Agent", email: "agent@x.test" },
            registrations: [{ name: "Seeker", email: "seeker@x.test" }],
          }),
      }),
    }),
  },
}));

import { GET } from "@/app/api/referral-links/[id]/route";

async function get(ctx: Record<string, unknown>) {
  currentCtx = { locale: "en", ...ctx };
  return GET(new NextRequest(`http://localhost/api/referral-links/${LINK_ID}`), {
    params: Promise.resolve({ id: LINK_ID }),
  } as never);
}

it.each(["employer", "job_seeker"])("refuses %s", async (role) => {
  expect((await get({ userId: "cccccccccccccccccccccccc", role })).status).toBe(403);
});

it("refuses a super-agent who does not oversee the creator", async () => {
  expect((await get({ userId: "dddddddddddddddddddddddd", role: "super_agent" })).status).toBe(403);
});

it("allows the creating agent and admin", async () => {
  expect((await get({ userId: CREATOR, role: "agent" })).status).toBe(200);
  expect((await get({ userId: "eeeeeeeeeeeeeeeeeeeeeeee", role: "admin" })).status).toBe(200);
});

it("rejects a malformed id without querying", async () => {
  currentCtx = { userId: CREATOR, role: "agent", locale: "en" };
  const res = await GET(new NextRequest("http://localhost/api/referral-links/not-an-id"), {
    params: Promise.resolve({ id: "not-an-id" }),
  } as never);
  expect(res.status).toBe(400);
});
