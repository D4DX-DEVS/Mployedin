/**
 * @jest-environment node
 */
/**
 * The super-agent home's cards each open a list, filtered to the records the
 * card counted. These pin the three list filters that had drifted from the
 * dashboard (15 exhibition requests opened a list of 2, 4 overdue follow-ups
 * opened 5, "1 deactivated agent" opened an unfiltered roster that could not
 * show who it was), by asserting the filter that reaches the model.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => unknown) =>
    async (req: NextRequest) => handler(req, { userId: "sa_user", role: "super_agent" }),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => ({
    saProfileId: "sa_profile",
    teamAgentIds: ["agent_doc_1"],
    regionAgentIds: [],
    effectiveAgentIds: ["agent_doc_1"],
    assignedCityIds: [],
    assignedStateIds: [],
  })),
  getSuperAgentOwnRegion: jest.fn(),
  isRegionSubset: jest.fn(),
}));
jest.mock("@/lib/notifications/exhibitionNotify", () => ({ notifySuperAgentOfExhibition: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["sort", "skip", "limit", "populate", "select"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const leadFind = jest.fn();
const userFind = jest.fn();
const exhibitionFind = jest.fn();

jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: {
    find: (filter: unknown) => { leadFind(filter); return chain([]); },
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
    distinct: jest.fn(async () => []),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: (filter: unknown) => {
      userFind(filter);
      return chain([
        { _id: "user_1", name: "Agent Active", email: "a@x.co", isActive: true },
        { _id: "user_2", name: "Agent Off", email: "b@x.co", isActive: false },
      ]);
    },
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: () => chain([
      { _id: "agent_doc_1", userId: "user_1" },
      { _id: "agent_doc_2", userId: "user_2" },
    ]),
  },
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { aggregate: jest.fn(async () => []) } }));
jest.mock("@/models/ExhibitionRequest", () => ({
  __esModule: true,
  default: {
    find: (filter: unknown) => { exhibitionFind(filter); return chain([]); },
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
    distinct: jest.fn(async () => []),
  },
  EXHIBITION_STATUSES: ["draft", "submitted", "under_review", "approved", "revision_requested", "budget_approved", "resources_assigned", "active", "completed", "rejected", "archived"],
  EXHIBITION_CATEGORIES: [],
  EXHIBITION_PARTICIPATION_TYPES: [],
  EXHIBITION_OBJECTIVES: [],
  EXHIBITION_RESOURCE_TYPES: [],
  EXHIBITION_PRIORITIES: [],
}));

import { GET as getLeads } from "@/app/api/super-agent/leads/route";
import { GET as getAgents } from "@/app/api/super-agent/agents/route";
import { GET as getExhibitions } from "@/app/api/exhibitions/route";

const req = (path: string) => new NextRequest(`http://localhost${path}`);
const call = (handler: unknown, path: string) => (handler as (r: NextRequest) => Promise<Response>)(req(path));

beforeEach(() => jest.clearAllMocks());

describe("overdue follow-ups = date passed AND lead still open", () => {
  it("drops converted and lost leads, inside $and so the territory scope stays", async () => {
    await call(getLeads, "/api/super-agent/leads?hasFollowUp=overdue");
    const filter = leadFind.mock.calls[0][0] as { followUpAt: { $lt: Date }; $and: Record<string, unknown>[] };
    expect(filter.followUpAt.$lt).toBeInstanceOf(Date);
    expect(filter.$and).toContainEqual({ status: { $nin: ["converted", "lost"] } });
    expect(filter.$and[0]).toEqual({ $or: [{ superAgentId: "sa_profile" }, { agentId: { $in: ["agent_doc_1"] } }] });
  });

  it("leaves closed leads in when the filter is only 'has a follow-up'", async () => {
    await call(getLeads, "/api/super-agent/leads?hasFollowUp=true");
    const filter = leadFind.mock.calls[0][0] as { $and: unknown[] };
    expect(filter.$and).not.toContainEqual({ status: { $nin: ["converted", "lost"] } });
  });
});

describe("agents roster: account status filter", () => {
  it("status=active keeps active accounts only", async () => {
    await call(getAgents, "/api/super-agent/agents?status=active");
    expect(userFind.mock.calls[0][0]).toMatchObject({ role: "agent", isActive: true });
  });

  it("status=inactive is the exact complement, so a missing flag counts as deactivated", async () => {
    await call(getAgents, "/api/super-agent/agents?status=inactive");
    expect(userFind.mock.calls[0][0]).toMatchObject({ role: "agent", isActive: { $ne: true } });
  });

  it("no status leaves the account switch unfiltered and reports it per row", async () => {
    const res = await call(getAgents, "/api/super-agent/agents");
    expect(userFind.mock.calls[0][0]).not.toHaveProperty("isActive");
    const body = await res.json();
    expect(body.items.map((a: { name: string; isActive: boolean }) => [a.name, a.isActive])).toEqual([
      ["Agent Active", true],
      ["Agent Off", false],
    ]);
  });
});

describe("exhibitions: status=pending_review", () => {
  it("matches the summary's pendingReview bucket — submitted and under review", async () => {
    await call(getExhibitions, "/api/exhibitions?status=pending_review");
    expect(exhibitionFind.mock.calls[0][0]).toMatchObject({ status: { $in: ["submitted", "under_review"] } });
  });

  it("still takes a single real status as before", async () => {
    await call(getExhibitions, "/api/exhibitions?status=submitted");
    expect(exhibitionFind.mock.calls[0][0]).toMatchObject({ status: "submitted" });
  });

  it("ignores an unknown status rather than matching nothing", async () => {
    await call(getExhibitions, "/api/exhibitions?status=bogus");
    expect(exhibitionFind.mock.calls[0][0]).not.toHaveProperty("status");
  });
});
