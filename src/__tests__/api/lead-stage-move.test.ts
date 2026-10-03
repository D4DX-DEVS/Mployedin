/**
 * @jest-environment node
 *
 * Stage moves carry their facts (2026-10-02): the stage route refuses a move
 * without the target stage's details, records what it was given, logs a
 * stage_change entry, and PATCH cannot be used to skip the rules. The
 * follow-up route can finally clear a follow-up, which PATCH never could.
 * Bulk moves go through the same rules and report the leads they skip.
 */
import { NextRequest } from "next/server";

const LEAD_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OWN_AGENT = "cccccccccccccccccccccccc";

let currentCtx: Record<string, unknown> = { userId: "u1", role: "agent", locale: "en" };
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) =>
      h(req, currentCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn() }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: OWN_AGENT }) }) }) },
}));

type FakeLead = Record<string, unknown> & { activityLog: Record<string, unknown>[]; save: jest.Mock };
let lead: FakeLead;
const findByIdAndUpdate = jest.fn();
jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: {
    findById: () => {
      // The PATCH route reads with .lean(); the stage/follow-up routes use the doc.
      const doc = Promise.resolve(lead) as Promise<FakeLead> & { lean: () => Promise<FakeLead> };
      doc.lean = () => Promise.resolve(lead);
      return doc;
    },
    findByIdAndUpdate: (...a: unknown[]) => findByIdAndUpdate(...a),
    find: () => Promise.resolve([lead]),
  },
}));

import { POST as moveStage } from "@/app/api/leads/[id]/stage/route";
import { PUT as setFollowUp, DELETE as clearFollowUp } from "@/app/api/leads/[id]/follow-up/route";
import { PATCH } from "@/app/api/leads/[id]/route";
import { POST as bulk } from "@/app/api/leads/bulk/route";

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
const stageUrl = `http://localhost/api/leads/${LEAD_ID}/stage`;
const followUpUrl = `http://localhost/api/leads/${LEAD_ID}/follow-up`;

beforeEach(() => {
  currentCtx = { userId: "u1", role: "agent", locale: "en" };
  lead = {
    _id: LEAD_ID,
    agentId: OWN_AGENT,
    status: "negotiating",
    companyName: "Acme",
    contactEmail: "a@acme.test",
    activityLog: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
  findByIdAndUpdate.mockReset();
});

describe("POST /api/leads/[id]/stage", () => {
  it("refuses Won without a final value and date, naming what is missing", async () => {
    const res = await moveStage(json(stageUrl, "POST", { status: "converted" }), {} as never);
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(["wonValue", "wonAt"]);
    expect(lead.save).not.toHaveBeenCalled();
  });

  it("records Won with its value and date and logs the move", async () => {
    const res = await moveStage(
      json(stageUrl, "POST", { status: "converted", wonValue: 89000, wonAt: "2026-10-02T00:00:00.000Z", note: "Signed" }),
      {} as never,
    );
    expect(res.status).toBe(200);
    expect(lead.status).toBe("converted");
    expect(lead.wonValue).toBe(89000);
    expect((lead.convertedAt as Date).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(lead.activityLog.at(-1)).toMatchObject({ action: "stage_change", fromStatus: "negotiating", toStatus: "converted", note: "Signed" });
    expect(lead.save).toHaveBeenCalledTimes(1);
  });

  it("records Lost with its reason category and the agent's words", async () => {
    const res = await moveStage(json(stageUrl, "POST", { status: "lost", lostReasonCode: "price", note: "Budget cut" }), {} as never);
    expect(res.status).toBe(200);
    expect(lead).toMatchObject({ status: "lost", lostReasonCode: "price", lostReason: "Budget cut" });
    expect(lead.lostAt).toBeInstanceOf(Date);
  });

  it("logs the contact a move to Contacted describes, and keeps it as the latest contact", async () => {
    lead.status = "new";
    const res = await moveStage(
      json(stageUrl, "POST", { status: "contacted", contactMethod: "whatsapp", contactedAt: "2026-10-01T09:30:00.000Z" }),
      {} as never,
    );
    expect(res.status).toBe(200);
    expect(lead.lastContactMethod).toBe("whatsapp");
    expect(lead.activityLog.map((a) => a.action)).toEqual(["whatsapp", "stage_change"]);
  });

  it("lets a lead move back without asking for anything", async () => {
    const res = await moveStage(json(stageUrl, "POST", { status: "interested" }), {} as never);
    expect(res.status).toBe(200);
    expect(lead.status).toBe("interested");
  });

  it("accepts a forward move the lead already has the details for", async () => {
    lead.status = "interested";
    lead.expectedRevenue = 1200;
    lead.followUpAt = new Date(Date.now() + 3 * 86400000);
    const res = await moveStage(json(stageUrl, "POST", { status: "negotiating" }), {} as never);
    expect(res.status).toBe(200);
  });

  it("does not count an overdue follow-up as the next one", async () => {
    lead.status = "interested";
    lead.expectedRevenue = 1200;
    lead.followUpAt = new Date(Date.now() - 3 * 86400000);
    const res = await moveStage(json(stageUrl, "POST", { status: "negotiating" }), {} as never);
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(["followUpAt"]);
  });

  it("asks Won for its own value and date even when old ones are on the lead", async () => {
    lead.wonValue = 500;
    lead.convertedAt = new Date("2026-01-01");
    const res = await moveStage(json(stageUrl, "POST", { status: "converted" }), {} as never);
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(["wonValue", "wonAt"]);
  });

  it("refuses a won date in the future", async () => {
    const wonAt = new Date(Date.now() + 5 * 86400000).toISOString();
    const res = await moveStage(json(stageUrl, "POST", { status: "converted", wonValue: 10, wonAt }), {} as never);
    expect(res.status).toBe(400);
    expect((await res.json()).invalid).toEqual(["wonAt"]);
    expect(lead.save).not.toHaveBeenCalled();
  });

  it("keeps a long Lost note whole on the log while the reason field takes 500", async () => {
    const note = "x".repeat(600);
    const res = await moveStage(json(stageUrl, "POST", { status: "lost", lostReasonCode: "other", note }), {} as never);
    expect(res.status).toBe(200);
    expect((lead.lostReason as string).length).toBe(500);
    expect(lead.activityLog.at(-1)).toMatchObject({ action: "stage_change", note });
  });

  it("a new follow-up date alone keeps what the follow-up is for", async () => {
    Object.assign(lead, { status: "interested", expectedRevenue: 1200, followUpType: "call", followUpNote: "Send proposal" });
    const followUpAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const res = await moveStage(json(stageUrl, "POST", { status: "negotiating", followUpAt }), {} as never);
    expect(res.status).toBe(200);
    expect(lead).toMatchObject({ followUpType: "call", followUpNote: "Send proposal" });
  });

  it("reopening a Lost lead clears its loss", async () => {
    Object.assign(lead, { status: "lost", lostReasonCode: "price", lostReason: "Budget", lostAt: new Date() });
    const res = await moveStage(json(stageUrl, "POST", { status: "contacted" }), {} as never);
    expect(res.status).toBe(200);
    expect(lead).toMatchObject({ status: "contacted", lostReasonCode: undefined, lostReason: undefined, lostAt: undefined });
  });

  it("taking a lead back out of Won clears the win unless its account exists", async () => {
    Object.assign(lead, { status: "converted", wonValue: 900, convertedAt: new Date() });
    await moveStage(json(stageUrl, "POST", { status: "negotiating" }), {} as never);
    expect(lead).toMatchObject({ wonValue: undefined, convertedAt: undefined });

    const at = new Date();
    Object.assign(lead, { status: "converted", wonValue: 900, convertedAt: at, convertedToEmployerId: "e1" });
    await moveStage(json(stageUrl, "POST", { status: "negotiating" }), {} as never);
    expect(lead).toMatchObject({ wonValue: 900, convertedAt: at });
  });

  it("refuses a move to the stage the lead is already in", async () => {
    expect((await moveStage(json(stageUrl, "POST", { status: "negotiating" }), {} as never)).status).toBe(409);
  });

  it("refuses an agent who does not own the lead", async () => {
    lead.agentId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    expect((await moveStage(json(stageUrl, "POST", { status: "interested" }), {} as never)).status).toBe(403);
  });
});

describe("PATCH /api/leads/[id] cannot skip the stage rules", () => {
  it("refuses a stage change and points at the stage route", async () => {
    const res = await PATCH(json(`http://localhost/api/leads/${LEAD_ID}`, "PATCH", { status: "lost" }), {} as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/\/stage/);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("still saves an edit that repeats the current stage", async () => {
    findByIdAndUpdate.mockResolvedValue({ ...lead, companyName: "Acme 2" });
    const res = await PATCH(json(`http://localhost/api/leads/${LEAD_ID}`, "PATCH", { status: "negotiating", companyName: "Acme 2" }), {} as never);
    expect(res.status).toBe(200);
    const update = findByIdAndUpdate.mock.calls[0][1].$set;
    expect(update.companyName).toBe("Acme 2");
    expect(update).not.toHaveProperty("status");
  });
});

describe("POST /api/leads/bulk move_status", () => {
  const bulkUrl = "http://localhost/api/leads/bulk";
  const move = (status: string) =>
    bulk(json(bulkUrl, "POST", { leadIds: [LEAD_ID], action: "move_status", params: { status } }), {} as never);

  it("skips a lead the target stage needs details for, and says which", async () => {
    const body = await (await move("converted")).json();
    expect(body.modified).toBe(0);
    expect(body.skipped).toEqual([{ id: LEAD_ID, missing: ["wonValue", "wonAt"] }]);
    expect(lead.status).toBe("negotiating");
    expect(lead.save).not.toHaveBeenCalled();
  });

  it("moves and logs a lead that needs nothing new", async () => {
    const body = await (await move("interested")).json();
    expect(body.modified).toBe(1);
    expect(lead.status).toBe("interested");
    expect(lead.activityLog.at(-1)).toMatchObject({ action: "stage_change", fromStatus: "negotiating", toStatus: "interested" });
  });
});

describe("/api/leads/[id]/follow-up", () => {
  it("schedules a follow-up and re-arms the reminder", async () => {
    lead.lastFollowupReminderAt = new Date();
    const res = await setFollowUp(
      json(followUpUrl, "PUT", { followUpAt: "2026-10-04T10:30:00.000Z", followUpType: "whatsapp", followUpNote: "Send proposal" }),
      {} as never,
    );
    expect(res.status).toBe(200);
    expect(lead).toMatchObject({ followUpType: "whatsapp", followUpNote: "Send proposal", lastFollowupReminderAt: undefined });
  });

  it("marks a follow-up done: logs it as the planned contact and clears it", async () => {
    Object.assign(lead, { followUpAt: new Date(), followUpType: "call", followUpNote: "Confirm headcount" });
    const res = await clearFollowUp(json(`${followUpUrl}?done=1`, "DELETE"), {} as never);
    expect(res.status).toBe(200);
    expect(lead.activityLog.at(-1)).toMatchObject({ action: "call", note: "Confirm headcount" });
    expect(lead.lastContactMethod).toBe("call");
    expect(lead.followUpAt).toBeUndefined();
  });

  it("clears without logging when it did not happen", async () => {
    Object.assign(lead, { followUpAt: new Date(), followUpType: "call" });
    await clearFollowUp(json(followUpUrl, "DELETE"), {} as never);
    expect(lead.activityLog).toEqual([]);
    expect(lead.followUpAt).toBeUndefined();
  });

  it("rejects a date it cannot parse", async () => {
    // validateBody throws its 400; the real withAuth turns the throw into the response.
    await expect(setFollowUp(json(followUpUrl, "PUT", { followUpAt: "next tuesday" }), {} as never))
      .rejects.toMatchObject({ status: 400 });
    expect(lead.save).not.toHaveBeenCalled();
  });
});
