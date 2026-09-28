/**
 * @jest-environment node
 *
 * The copilot's approve_commission tool must follow the same rules as
 * PATCH /api/commissions/[id]: only pending lines, never the caller's own line,
 * and the approval notice goes to the person who earns the line.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const notifyCommissionApproved = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyCommissionApproved: (...a: unknown[]) => notifyCommissionApproved(...a),
}));

let currentDoc: Record<string, unknown> & { save: jest.Mock };
jest.mock("@/models/Commission", () => ({ __esModule: true, default: { findById: jest.fn(async () => currentDoc) } }));

const agentFindOne = jest.fn();
const superAgentFindOne = jest.fn();
const lookup = (fn: jest.Mock) => (...a: unknown[]) => {
  const chain = { select: () => chain, session: () => chain, lean: async () => fn(...a) };
  return chain;
};
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: lookup(agentFindOne), findById: lookup(jest.fn(() => ({ userId: "agent_user_1" }))) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: lookup(superAgentFindOne), findById: lookup(jest.fn(() => ({ userId: "sa_user_1" }))) },
}));

const ID = "507f1f77bcf86cd799439061";
const doc = (overrides: Record<string, unknown> = {}) => ({
  _id: ID, type: "placement", agentId: "agent_1", superAgentId: "sa_1",
  amount: 500, currency: "AED", status: "pending", save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

async function run(role: "admin" | "super_agent", userId: string) {
  const { approveCommissionTool } = await import("@/lib/ai/copilot/tools/shared");
  return approveCommissionTool.execute({ commissionId: ID }, { role, userId } as never);
}

describe("copilot approve_commission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    agentFindOne.mockReturnValue(null);
    superAgentFindOne.mockReturnValue(null);
  });

  it("approves a team placement line for its super-agent and tells only the agent", async () => {
    superAgentFindOne.mockReturnValue({ _id: "sa_1" });
    currentDoc = doc();
    const result = await run("super_agent", "sa_user_1");
    expect(result.ok).toBe(true);
    expect(currentDoc.status).toBe("approved");
    expect(notifyCommissionApproved).toHaveBeenCalledTimes(1);
    expect(notifyCommissionApproved).toHaveBeenCalledWith("agent_user_1", "agent", 500, "AED");
  });

  it("refuses a super-agent approving their own override", async () => {
    superAgentFindOne.mockReturnValue({ _id: "sa_1" });
    currentDoc = doc({ type: "override", agentId: undefined });
    const result = await run("super_agent", "sa_user_1");
    expect(result.ok).toBe(false);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("tells the super-agent when an admin approves their override", async () => {
    currentDoc = doc({ type: "override", agentId: undefined });
    expect((await run("admin", "admin_1")).ok).toBe(true);
    expect(notifyCommissionApproved).toHaveBeenCalledWith("sa_user_1", "super_agent", 500, "AED");
  });

  it.each(["disputed", "clawed_back", "approved", "paid"])("does not approve a %s commission", async (status) => {
    currentDoc = doc({ status });
    expect((await run("admin", "admin_1")).ok).toBe(false);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });
});
