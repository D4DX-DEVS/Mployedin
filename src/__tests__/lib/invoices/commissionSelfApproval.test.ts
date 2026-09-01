/**
 * @jest-environment node
 */
/**
 * Segregation of duties on the invoice "paid" transition.
 *
 * Marking an invoice paid auto-approves its pending commission lines, and that
 * transition is self-asserted — no payment gateway confirms it. So whoever
 * performs it must not auto-approve the line they themselves earn; that line
 * stays pending for admin review. Everyone else's lines still go through.
 */

const commissionFind = jest.fn();
const commissionUpdateMany = jest.fn();
const agentFindOne = jest.fn();
const superAgentFindOne = jest.fn();
const agentFind = jest.fn();
const superAgentFind = jest.fn();

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => commissionFind(...args),
    updateMany: (...args: unknown[]) => commissionUpdateMany(...args),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => agentFindOne(...args),
    find: (...args: unknown[]) => agentFind(...args),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => superAgentFindOne(...args),
    find: (...args: unknown[]) => superAgentFind(...args),
  },
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notifyCommissionApproved: jest.fn().mockResolvedValue(undefined),
}));

import {
  approvePendingCommissionsForPaidInvoice,
  isOwnCommissionLine,
} from "@/lib/invoices/commissionRecords";

/** Mongoose chain used by the helper: find().select().session().lean() */
function mockPendingCommissions(rows: Record<string, unknown>[]) {
  commissionFind.mockReturnValue({
    select: () => ({
      session: () => ({ lean: async () => rows }),
    }),
  });
}

/** Mongoose chain to resolve a profile: findOne().select()[.session()].lean() */
function mockProfile(mock: jest.Mock, doc: Record<string, unknown> | null) {
  const chain = {
    session: () => chain,
    lean: async () => doc,
  };
  mock.mockReturnValue({ select: () => chain });
}

/** Mongoose chain used for the notification lookup: find().select().lean() */
function mockProfileList(mock: jest.Mock, rows: Record<string, unknown>[]) {
  mock.mockReturnValue({
    select: () => ({ lean: async () => rows }),
  });
}

const AGENT_PROFILE = "agent_profile_001";
const SUPER_AGENT_PROFILE = "sa_profile_001";

// One agent line and one super-agent override line on the same invoice.
// The agent's "placement" line also carries the OVERSEEING super-agent's id —
// that is how the real records are written — so it doubles as cover for the
// super-agent not being treated as its beneficiary.
const AGENT_LINE = {
  _id: "comm_agent",
  agentId: AGENT_PROFILE,
  superAgentId: SUPER_AGENT_PROFILE,
  type: "placement",
  amount: 100,
  currency: "AED",
};
const SUPER_AGENT_LINE = {
  _id: "comm_super_agent",
  agentId: null,
  superAgentId: SUPER_AGENT_PROFILE,
  type: "override",
  amount: 25,
  currency: "AED",
};

describe("commission self-approval exclusion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    commissionUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mockProfile(agentFindOne, null);
    mockProfile(superAgentFindOne, null);
    // Profile -> userId maps used to address approval notifications.
    mockProfileList(agentFind, [{ _id: AGENT_PROFILE, userId: "agent_user_001" }]);
    mockProfileList(superAgentFind, [{ _id: SUPER_AGENT_PROFILE, userId: "sa_user_001" }]);
  });

  it("leaves the acting super-agent's own line pending and approves the rest", async () => {
    mockPendingCommissions([AGENT_LINE, SUPER_AGENT_LINE]);
    mockProfile(superAgentFindOne, { _id: SUPER_AGENT_PROFILE });

    const result = await approvePendingCommissionsForPaidInvoice(
      "inv_001",
      "sa_user_001",
      { sendNotifications: false },
    );

    // Only the agent's line was approved.
    expect(result.approvedCommissionIds).toEqual(["comm_agent"]);
    expect(commissionUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ["comm_agent"] } },
      expect.objectContaining({ $set: expect.objectContaining({ status: "approved" }) }),
      {},
    );

    // The super-agent's own line stayed pending for admin review.
    expect(result.skippedSelfApproval).toBe(1);
    expect(result.skippedCommissionIds).toEqual(["comm_super_agent"]);

    // No notification is emitted for the skipped override (amount 25). The SA
    // is still notified about the agent's placement line (amount 100), which
    // they oversee — that one really was approved.
    expect(result.notifications.every((n) => n.amount === 100)).toBe(true);
  });

  it("approves nothing when the only pending line belongs to the approver", async () => {
    mockPendingCommissions([SUPER_AGENT_LINE]);
    mockProfile(superAgentFindOne, { _id: SUPER_AGENT_PROFILE });

    const result = await approvePendingCommissionsForPaidInvoice(
      "inv_002",
      "sa_user_001",
      { sendNotifications: false },
    );

    expect(result.approved).toBe(0);
    expect(result.skippedSelfApproval).toBe(1);
    expect(commissionUpdateMany).not.toHaveBeenCalled();
  });

  it("still approves a super-agent line when a different super-agent approves", async () => {
    mockPendingCommissions([AGENT_LINE, SUPER_AGENT_LINE]);
    mockProfile(superAgentFindOne, { _id: "sa_profile_999" });

    const result = await approvePendingCommissionsForPaidInvoice(
      "inv_003",
      "other_sa_user",
      { sendNotifications: false },
    );

    expect(result.skippedSelfApproval).toBe(0);
    expect(result.approvedCommissionIds).toEqual(["comm_agent", "comm_super_agent"]);
  });

  it("excludes an acting agent's own line too", async () => {
    mockPendingCommissions([AGENT_LINE, SUPER_AGENT_LINE]);
    mockProfile(agentFindOne, { _id: AGENT_PROFILE });

    const result = await approvePendingCommissionsForPaidInvoice(
      "inv_004",
      "agent_user_001",
      { sendNotifications: false },
    );

    expect(result.skippedCommissionIds).toEqual(["comm_agent"]);
    expect(result.approvedCommissionIds).toEqual(["comm_super_agent"]);
  });

  it("approves every line for an admin, who earns no commission", async () => {
    mockPendingCommissions([AGENT_LINE, SUPER_AGENT_LINE]);
    // Admin has neither an agent nor a super-agent profile.

    const result = await approvePendingCommissionsForPaidInvoice(
      "inv_005",
      "admin_001",
      { sendNotifications: false },
    );

    expect(result.skippedSelfApproval).toBe(0);
    expect(result.approvedCommissionIds).toEqual(["comm_agent", "comm_super_agent"]);
    expect(result.approver).toEqual({ agentId: null, superAgentId: null });
  });

  describe("isOwnCommissionLine", () => {
    const asSuperAgent = { agentId: null, superAgentId: SUPER_AGENT_PROFILE };

    it("treats only the override line as the super-agent's own", () => {
      expect(isOwnCommissionLine(SUPER_AGENT_LINE, asSuperAgent)).toBe(true);
      expect(isOwnCommissionLine(AGENT_LINE, asSuperAgent)).toBe(false);
    });

    it("does not claim an agent's placement line for its overseeing super-agent", () => {
      // The placement line carries the SA's id for scoping, but the AGENT earns
      // it. Matching on superAgentId alone here would block a super-agent from
      // approving their own team's commissions.
      expect(
        isOwnCommissionLine(
          { agentId: AGENT_PROFILE, superAgentId: SUPER_AGENT_PROFILE, type: "placement" },
          asSuperAgent,
        ),
      ).toBe(false);
    });

    it("reads the embedded invoice line's `role` as well as the record's `type`", () => {
      expect(
        isOwnCommissionLine({ superAgentId: SUPER_AGENT_PROFILE, role: "super_agent" }, asSuperAgent),
      ).toBe(true);
      expect(
        isOwnCommissionLine(
          { agentId: AGENT_PROFILE, superAgentId: SUPER_AGENT_PROFILE, role: "agent" },
          asSuperAgent,
        ),
      ).toBe(false);
    });

    it("matches nothing for an approver with no commission identity", () => {
      const admin = { agentId: null, superAgentId: null };
      expect(isOwnCommissionLine(SUPER_AGENT_LINE, admin)).toBe(false);
      expect(isOwnCommissionLine(AGENT_LINE, admin)).toBe(false);
    });
  });
});
