/**
 * @jest-environment node
 */
/**
 * Owner, 2026-10-15: the admin approves the payment and the support in one
 * step, the agent's event report is the final step, and amounts are corrected in place
 * instead of stepping a request back. The safeguards on that in-place edit:
 * a reason once the payment is approved, the old and new values in the
 * history, and the agent and super agent told.
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
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve({ userId: SA_USER }) }) }) },
}));
const notifyExhibitionBudgetChanged = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyExhibitionBudgetChanged: (...a: unknown[]) => notifyExhibitionBudgetChanged(...a),
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

import { PATCH } from "@/app/api/exhibitions/[id]/route";

const ID = "64b000000000000000000001";
const AGENT_USER = "64b0000000000000000000a9";
const SA_USER = "64b00000000000000000005a";
const ADMIN_USER = "64b0000000000000000000ad";

type Handler = (r: NextRequest, c: unknown, p: unknown) => Promise<Response>;

function makeDoc(status: string, extra: Record<string, unknown> = {}) {
  const doc = {
    _id: ID,
    agentId: { toString: () => AGENT_USER },
    superAgentId: "64b0000000000000000000s1",
    status,
    eventName: "Doha Career Fair",
    budgetCurrency: "QAR",
    estimatedBudget: 800,
    approvedBudget: 700 as number | undefined,
    actualSpend: undefined as number | undefined,
    eventStartDate: new Date("2026-10-01T00:00:00Z"),
    supportItems: [{ item: "tv", requestedQty: 2, allocatedQty: 2, deliveryStatus: "pending" }],
    statusHistory: [{ status: "submitted" }, { status: "approved" }] as Record<string, unknown>[],
    save: jest.fn().mockResolvedValue(undefined),
    ...extra,
  };
  findOne.mockResolvedValue(doc);
  return doc;
}

function patch(body: unknown, role = "admin", userId = ADMIN_USER) {
  const req = new NextRequest(`http://t/api/exhibitions/${ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return (PATCH as unknown as Handler)(req, { userId, role }, { id: ID });
}

beforeEach(() => {
  findOne.mockReset();
  notifyExhibitionBudgetChanged.mockClear();
});

describe("payment approval", () => {
  it("needs every requested support item decided", async () => {
    const doc = makeDoc("approved", { supportItems: [{ item: "tv", requestedQty: 2 }] });
    const res = await patch({ status: "budget_approved", approvedBudget: 700 });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("ALLOCATION_REQUIRED");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("approves the payment with the amount, then the event goes straight to its report", async () => {
    const doc = makeDoc("approved", { approvedBudget: undefined });
    expect((await patch({ status: "budget_approved", approvedBudget: 650 })).status).toBe(200);
    expect(doc).toMatchObject({ status: "budget_approved", approvedBudget: 650 });
    expect((await patch({ status: "resources_assigned" })).status).toBe(409);
  });
});

describe("editing the approved amount in place", () => {
  it("needs a reason once the payment is approved", async () => {
    const doc = makeDoc("budget_approved");
    const res = await patch({ approvedBudget: 900 });
    expect(res.status).toBe(422);
    expect(doc.approvedBudget).toBe(700);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("logs old to new with the reason and tells the agent and super agent", async () => {
    const doc = makeDoc("budget_approved");
    const res = await patch({ approvedBudget: 900, statusReason: "Stall price went up" });
    expect(res.status).toBe(200);
    expect(doc.approvedBudget).toBe(900);
    expect(doc.statusHistory.at(-1)).toMatchObject({
      status: "budget_approved",
      note: "Approved budget changed from QAR 700 to QAR 900",
      statusReason: "Stall price went up",
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifyExhibitionBudgetChanged).toHaveBeenCalledWith(
      [AGENT_USER, SA_USER], "Doha Career Fair", "QAR 700", "QAR 900", "Stall price went up", "/agent/exhibitions", ADMIN_USER,
    );
  });

  it("asks nothing when the amount did not change", async () => {
    const doc = makeDoc("budget_approved");
    expect((await patch({ approvedBudget: 700 })).status).toBe(200);
    expect(doc.statusHistory).toHaveLength(2);
    expect(notifyExhibitionBudgetChanged).not.toHaveBeenCalled();
  });
});

describe("after the event", () => {
  it("ends at completed: no settle or archive move", async () => {
    const doc = makeDoc("completed");
    expect((await patch({ status: "archived" })).status).toBe(409);
    expect(doc.status).toBe("completed");
  });

  it("still records the actual spend on a completed event", async () => {
    const doc = makeDoc("completed");
    expect((await patch({ actualSpend: 640 })).status).toBe(200);
    expect(doc.actualSpend).toBe(640);
  });

  it("keeps the amounts of an older archived event locked", async () => {
    const doc = makeDoc("archived", { statusHistory: [{ status: "completed" }, { status: "archived" }] });
    expect((await patch({ actualSpend: 1 })).status).toBe(409);
    expect((await patch({ approvedBudget: 1, statusReason: "x" })).status).toBe(409);
    expect(doc.save).not.toHaveBeenCalled();
  });
});

describe("the agent's event report", () => {
  it("waits for the start date", async () => {
    const doc = makeDoc("budget_approved", { eventStartDate: new Date(Date.now() + 10 * 86_400_000) });
    const res = await patch({ status: "completed", completionReport: { actualLeads: 3 } }, "agent", AGENT_USER);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("EVENT_NOT_STARTED");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("is filed from the payment-approved stage once the event has started", async () => {
    const doc = makeDoc("budget_approved");
    const res = await patch({ status: "completed", completionReport: { actualLeads: 3 } }, "agent", AGENT_USER);
    expect(res.status).toBe(200);
    expect(doc.status).toBe("completed");
  });
});
