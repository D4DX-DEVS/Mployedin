/**
 * @jest-environment node
 */
const agentFind = jest.fn();
const saFind = jest.fn();
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { find: (...a: unknown[]) => agentFind(...a) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { find: (...a: unknown[]) => saFind(...a) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const populateLean = (v: unknown) => ({ select: () => ({ populate: () => ({ lean: async () => v }) }) });

const A1 = "650000000000000000000001";
const S1 = "650000000000000000000002";

function items() {
  return [
    { _id: "js1", fullName: "Sara", referral: { agentId: A1, code: "MPL-A", referrerRole: "agent", referredAt: "2026-09-01T00:00:00.000Z" } },
    { _id: "js2", fullName: "Omar", referral: { superAgentId: S1, code: "MPL-S", referrerRole: "super_agent", referredAt: "2026-09-02T00:00:00.000Z" } },
    { _id: "js3", fullName: "Lina" },
  ];
}

describe("decorateReferralSummaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    agentFind.mockReturnValue(populateLean([{ _id: A1, userId: { name: "Agent Ann" } }]));
    saFind.mockReturnValue(populateLean([{ _id: S1, userId: { name: "Super Sam" } }]));
  });

  it("gives admins role, name and code, and strips the raw sub-document", async () => {
    const { decorateReferralSummaries } = await import("@/lib/referrals/summary");
    const out = await decorateReferralSummaries(items(), { role: "admin" });
    expect(out[0].referralSummary).toEqual({ role: "agent", name: "Agent Ann", code: "MPL-A", referredAt: "2026-09-01T00:00:00.000Z" });
    expect(out[1].referralSummary).toEqual({ role: "super_agent", name: "Super Sam", code: "MPL-S", referredAt: "2026-09-02T00:00:00.000Z" });
    expect(out[2].referralSummary).toBeUndefined();
    expect((out[0] as Record<string, unknown>).referral).toBeUndefined();
    expect(agentFind).toHaveBeenCalledWith({ _id: { $in: [A1] } });
  });

  it("gives an agent only role, date and isMine — no names, no code", async () => {
    const { decorateReferralSummaries } = await import("@/lib/referrals/summary");
    const out = await decorateReferralSummaries(items(), { role: "agent", selfAgentId: A1 });
    expect(out[0].referralSummary).toEqual({ role: "agent", referredAt: "2026-09-01T00:00:00.000Z", isMine: true });
    expect(out[1].referralSummary).toEqual({ role: "super_agent", referredAt: "2026-09-02T00:00:00.000Z", isMine: false });
    expect(agentFind).not.toHaveBeenCalled();
  });

  it("gives a super-agent team agent names and isMine for their own links", async () => {
    const { decorateReferralSummaries } = await import("@/lib/referrals/summary");
    const out = await decorateReferralSummaries(items(), { role: "super_agent", selfSuperAgentId: S1 });
    expect(out[0].referralSummary).toEqual({ role: "agent", name: "Agent Ann", referredAt: "2026-09-01T00:00:00.000Z", isMine: false });
    expect(out[1].referralSummary).toEqual({ role: "super_agent", name: "Super Sam", referredAt: "2026-09-02T00:00:00.000Z", isMine: true });
  });

  it("never hands a code to anyone but an admin", async () => {
    const { decorateReferralSummaries } = await import("@/lib/referrals/summary");
    for (const viewer of [{ role: "agent" as const, selfAgentId: A1 }, { role: "super_agent" as const, selfSuperAgentId: S1 }]) {
      const out = await decorateReferralSummaries(items(), viewer);
      expect(JSON.stringify(out)).not.toContain("MPL-");
    }
  });

  it("skips the lookups when nothing is referred", async () => {
    const { decorateReferralSummaries } = await import("@/lib/referrals/summary");
    const unreferred: Array<{ _id: string; referral?: unknown }> = [{ _id: "x" }];
    await decorateReferralSummaries(unreferred, { role: "admin" });
    expect(agentFind).not.toHaveBeenCalled();
    expect(saFind).not.toHaveBeenCalled();
  });
});
