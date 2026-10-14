/**
 * @jest-environment node
 */
/**
 * /api/exhibitions/[id] for the super-agent review: reading one request from
 * their own team, and the Start review / Approve / Request changes / Reject
 * moves. Approval is operational only — it must never touch allocation or
 * delivery — and every move appends to the history instead of replacing it.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({ withAuth: (handler: Function) => handler }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) },
}));

const getSuperAgentScope = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: (...a: unknown[]) => getSuperAgentScope(...a) }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: () => ({ select: () => ({ lean: () => Promise.resolve([{ userId: TEAM_AGENT_USER }]) }) }) },
}));

const findOne = jest.fn();
jest.mock("@/models/ExhibitionRequest", () => ({
  __esModule: true,
  EXHIBITION_STATUSES: [],
  EXHIBITION_CATEGORIES: [],
  EXHIBITION_PARTICIPATION_TYPES: [],
  EXHIBITION_OBJECTIVES: [],
  EXHIBITION_RESOURCE_TYPES: [],
  EXHIBITION_PRIORITIES: ["low", "medium", "high", "critical"],
  default: { findOne: (...a: unknown[]) => findOne(...a) },
}));

import { GET, PATCH } from "@/app/api/exhibitions/[id]/route";

const ID = "64b000000000000000000001";
const TEAM_AGENT_USER = "64b0000000000000000000a9";
const OTHER_AGENT_USER = "64b0000000000000000000b9";
const SA_USER = "64b0000000000000000000sa".replace("sa", "5a");

type Handler = (r: NextRequest, c: unknown, p: unknown) => Promise<Response>;

function makeDoc(status: string, agent = TEAM_AGENT_USER) {
  const doc = {
    _id: ID,
    agentId: { toString: () => agent },
    status,
    eventName: "Doha Career Fair",
    estimatedBudget: 800,
    supportItems: [{ item: "tv", requestedQty: 2, deliveryStatus: "pending" }],
    statusHistory: [{ status: "submitted", changedAt: new Date("2026-10-01"), changedBy: agent }] as Record<string, unknown>[],
    reviewedBy: undefined as unknown,
    reviewNote: undefined as unknown,
    recommendedBudget: undefined as unknown,
    save: jest.fn().mockResolvedValue(undefined),
  };
  findOne.mockResolvedValue(doc);
  return doc;
}

function patch(body: unknown, role = "super_agent") {
  const req = new NextRequest(`http://t/api/exhibitions/${ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return (PATCH as unknown as Handler)(req, { userId: SA_USER, role }, { id: ID });
}

function populatedQuery(result: unknown) {
  const q = {
    populate: () => q,
    lean: () => Promise.resolve(result),
  };
  return q;
}

beforeEach(() => {
  findOne.mockReset();
  getSuperAgentScope.mockReset().mockResolvedValue({ effectiveAgentIds: ["64b0000000000000000000p1"] });
});

describe("GET /api/exhibitions/[id] — super agent", () => {
  it("opens a request from their own team even though agentId comes back populated", async () => {
    findOne.mockReturnValue(populatedQuery({ _id: ID, agentId: { _id: TEAM_AGENT_USER, name: "Ahmed" }, statusHistory: [] }));
    const res = await (GET as unknown as Handler)(new NextRequest(`http://t/api/exhibitions/${ID}`), { userId: SA_USER, role: "super_agent" }, { id: ID });
    expect(res.status).toBe(200);
  });

  it("refuses a request from another team", async () => {
    findOne.mockReturnValue(populatedQuery({ _id: ID, agentId: { _id: OTHER_AGENT_USER, name: "Ravi" }, statusHistory: [] }));
    const res = await (GET as unknown as Handler)(new NextRequest(`http://t/api/exhibitions/${ID}`), { userId: SA_USER, role: "super_agent" }, { id: ID });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/exhibitions/[id] — super-agent review", () => {
  it("approves, records the recommendation and the actor, and leaves allocation alone", async () => {
    const doc = makeDoc("under_review");
    const res = await patch({ status: "approved", approvedBudget: 750, reviewNote: "Looks good" });
    expect(res.status).toBe(200);
    expect(doc.status).toBe("approved");
    expect(doc.recommendedBudget).toBe(750);
    // Approval is not allocation: nothing allocated, nothing delivered.
    expect(doc.supportItems[0]).toEqual({ item: "tv", requestedQty: 2, deliveryStatus: "pending" });
    // History is appended, not replaced.
    expect(doc.statusHistory).toHaveLength(2);
    expect(doc.statusHistory[0]).toMatchObject({ status: "submitted" });
    expect(doc.statusHistory[1]).toMatchObject({ status: "approved", approverRole: "super_agent", changedBy: SA_USER, note: "Looks good" });
    expect(doc.save).toHaveBeenCalled();
  });

  it("can start a review, and can reject a new submission with a reason", async () => {
    let doc = makeDoc("submitted");
    expect((await patch({ status: "under_review" })).status).toBe(200);
    expect(doc.status).toBe("under_review");

    doc = makeDoc("submitted");
    expect((await patch({ status: "rejected", statusReason: "Duplicate of another request" })).status).toBe(200);
    expect(doc.statusHistory[1]).toMatchObject({ status: "rejected", statusReason: "Duplicate of another request" });
  });

  it("reject and request-changes need a reason, in words the reviewer can act on", async () => {
    let doc = makeDoc("under_review");
    let res = await patch({ status: "rejected", statusReason: "   " });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Give the agent a reason for rejecting this request.");
    expect(doc.save).not.toHaveBeenCalled();

    doc = makeDoc("under_review");
    res = await patch({ status: "revision_requested" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Tell the agent what needs to change.");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("a move the stage does not allow is a 409, not a silent change", async () => {
    for (const [from, to] of [
      ["approved", "approved"],
      ["approved", "budget_approved"],
      ["submitted", "approved"],
      ["rejected", "under_review"],
      ["budget_approved", "resources_assigned"],
    ]) {
      const doc = makeDoc(from);
      const res = await patch({ status: to, statusReason: "x" });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("INVALID_TRANSITION");
      expect(body.error).not.toMatch(/transition from/i);
      expect(doc.status).toBe(from);
      expect(doc.save).not.toHaveBeenCalled();
    }
  });

  it("a super agent cannot review another team's request", async () => {
    const doc = makeDoc("under_review", OTHER_AGENT_USER);
    const res = await patch({ status: "approved" });
    expect(res.status).toBe(403);
    expect(doc.status).toBe("under_review");
  });
});
