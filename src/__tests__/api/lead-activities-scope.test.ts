/**
 * @jest-environment node
 *
 * /api/leads/[id]/activities checked agents only, so any super-agent could read
 * any team's lead log and append fake activity to it (audit 2026-09-24, SEC-03).
 * It now shares canAccessLead with /api/leads/[id].
 */
import { NextRequest } from "next/server";

const LEAD_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_AGENT = "bbbbbbbbbbbbbbbbbbbbbbbb";
const OWN_AGENT = "cccccccccccccccccccccccc";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) =>
      h(req, currentCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));

const getSuperAgentScope = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: (...a: unknown[]) => getSuperAgentScope(...a),
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: OWN_AGENT }) }) }) },
}));

const lead = {
  _id: LEAD_ID,
  agentId: OTHER_AGENT,
  superAgentId: "dddddddddddddddddddddddd",
  activityLog: [] as unknown[],
  save: jest.fn().mockResolvedValue(undefined),
};
jest.mock("@/models/Lead", () => ({ __esModule: true, default: { findById: () => Promise.resolve(lead) } }));

import { GET, POST } from "@/app/api/leads/[id]/activities/route";

const url = `http://localhost/api/leads/${LEAD_ID}/activities`;

beforeEach(() => {
  lead.activityLog = [];
  lead.save.mockClear();
});

describe("super-agent outside the lead's team", () => {
  beforeEach(() => {
    currentCtx = { userId: "eeeeeeeeeeeeeeeeeeeeeeee", role: "super_agent", locale: "en" };
    getSuperAgentScope.mockResolvedValue({ saProfileId: "ffffffffffffffffffffffff", effectiveAgentIds: [OWN_AGENT] });
  });

  it("cannot read the activity log", async () => {
    expect((await GET(new NextRequest(url), {} as never)).status).toBe(403);
  });

  it("cannot append an activity", async () => {
    const res = await POST(
      new NextRequest(url, {
        method: "POST",
        body: JSON.stringify({ action: "note", note: "fake" }),
        headers: { "content-type": "application/json" },
      }),
      {} as never,
    );
    expect(res.status).toBe(403);
    expect(lead.save).not.toHaveBeenCalled();
  });
});

it("a super-agent whose agent owns the lead can read it", async () => {
  currentCtx = { userId: "eeeeeeeeeeeeeeeeeeeeeeee", role: "super_agent", locale: "en" };
  getSuperAgentScope.mockResolvedValue({ saProfileId: "ffffffffffffffffffffffff", effectiveAgentIds: [OTHER_AGENT] });
  expect((await GET(new NextRequest(url), {} as never)).status).toBe(200);
});

it("an agent who does not own the lead is refused; an employer is refused", async () => {
  currentCtx = { userId: "1", role: "agent", locale: "en" };
  expect((await GET(new NextRequest(url), {} as never)).status).toBe(403);
  currentCtx = { userId: "2", role: "employer", locale: "en" };
  expect((await GET(new NextRequest(url), {} as never)).status).toBe(403);
});
