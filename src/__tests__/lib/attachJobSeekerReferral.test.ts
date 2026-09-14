/**
 * @jest-environment node
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyReferrerJobSeekerRegistered: (...a: unknown[]) => notify(...a),
}));

const linkFindOne = jest.fn();
const linkFindOneAndUpdate = jest.fn();
const linkUpdateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => linkFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => linkFindOneAndUpdate(...a),
    updateOne: (...a: unknown[]) => linkUpdateOne(...a),
  },
}));

const seekerFindOne = jest.fn();
const seekerUpdateOne = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => seekerFindOne(...a),
    updateOne: (...a: unknown[]) => seekerUpdateOne(...a),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: "Sara Ali", email: "sara@example.com" }) }) })),
  },
}));

const lean = (v: unknown) => ({ lean: async () => v });
const selectLean = (v: unknown) => ({ select: () => ({ lean: async () => v }) });

const LINK = {
  _id: "64d000000000000000000001",
  code: "MPL-1A2B3C4D5E6F7A8B",
  audience: "job_seeker",
  isActive: true,
  maxUses: 0,
  usedCount: 3,
  createdBy: "64d000000000000000000002",
  creatorRole: "agent",
  agentId: "64d000000000000000000003",
};
const SEEKER = { _id: "64d000000000000000000010", fullName: "Sara Ali", createdAt: new Date() };

async function attach(code: string = LINK.code, extra: Record<string, unknown> = {}) {
  const { attachJobSeekerReferral } = await import("@/lib/referrals/attachJobSeeker");
  return attachJobSeekerReferral({ userId: "64d000000000000000000020", code, ...extra });
}

describe("attachJobSeekerReferral", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    linkFindOne.mockReturnValue(lean(LINK));
    linkFindOneAndUpdate.mockResolvedValue({ _id: LINK._id });
    seekerFindOne.mockReturnValue(selectLean(SEEKER));
    seekerUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    linkUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("consumes the link atomically, stamps the seeker, logs and notifies", async () => {
    const result = await attach();
    expect(result).toEqual({ attached: true, linkId: LINK._id, referrerRole: "agent" });

    const [filter, update] = linkFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: LINK._id, isActive: true });
    expect(update.$inc).toEqual({ usedCount: 1 });
    expect(update.$push.registrations).toMatchObject({
      kind: "job_seeker", jobSeekerId: SEEKER._id, name: "Sara Ali", email: "sara@example.com",
    });

    const [sFilter, sUpdate] = seekerUpdateOne.mock.calls[0];
    expect(sFilter).toEqual({ _id: SEEKER._id, referral: { $exists: false } });
    expect(sUpdate.$set.isAgentReferred).toBe(true);
    expect(sUpdate.$set.referral).toMatchObject({
      linkId: LINK._id, code: LINK.code, agentId: LINK.agentId,
      referrerUserId: LINK.createdBy, referrerRole: "agent",
    });
    expect(sUpdate.$set.referral.superAgentId).toBeUndefined();

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "referral.job_seeker_attached", resourceId: LINK._id }),
    );
    expect(notify).toHaveBeenCalledWith(LINK.createdBy, "agent", "Sara Ali", SEEKER._id);
  });

  it("guards maxUses in the update filter", async () => {
    linkFindOne.mockReturnValue(lean({ ...LINK, maxUses: 5 }));
    await attach();
    expect(linkFindOneAndUpdate.mock.calls[0][0]).toEqual({ _id: LINK._id, isActive: true, usedCount: { $lt: 5 } });
  });

  it("reports max_reached when the atomic update matches nothing", async () => {
    linkFindOne.mockReturnValue(lean({ ...LINK, maxUses: 3 }));
    linkFindOneAndUpdate.mockResolvedValue(null);
    expect(await attach()).toEqual({ attached: false, reason: "max_reached" });
    expect(seekerUpdateOne).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_code", "not a code", LINK],
    ["not_found", LINK.code, null],
    ["wrong_audience", LINK.code, { ...LINK, audience: "employer" }],
    ["wrong_audience", LINK.code, { ...LINK, audience: undefined }],
    ["inactive", LINK.code, { ...LINK, isActive: false }],
    ["expired", LINK.code, { ...LINK, expiresAt: new Date(Date.now() - 1000) }],
  ])("returns %s without touching anything", async (reason, code, link) => {
    linkFindOne.mockReturnValue(lean(link));
    expect(await attach(code as string)).toEqual({ attached: false, reason });
    expect(linkFindOneAndUpdate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("normalises the code before lookup", async () => {
    await attach("  mpl-1a2b3c4d5e6f7a8b ");
    expect(linkFindOne).toHaveBeenCalledWith({ code: LINK.code });
  });

  it("refuses a seeker who already has a referral", async () => {
    seekerFindOne.mockReturnValue(selectLean({ ...SEEKER, referral: { code: "MPL-OLD" } }));
    expect(await attach()).toEqual({ attached: false, reason: "already_referred" });
    expect(linkFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses an account older than the claim window", async () => {
    seekerFindOne.mockReturnValue(selectLean({ ...SEEKER, createdAt: new Date(Date.now() - 60 * 60 * 1000) }));
    expect(await attach()).toEqual({ attached: false, reason: "account_too_old" });
    expect(await attach(LINK.code, { maxAccountAgeMs: 2 * 60 * 60 * 1000 })).toMatchObject({ attached: true });
  });

  it("returns no_profile when the seeker document is missing", async () => {
    seekerFindOne.mockReturnValue(selectLean(null));
    expect(await attach()).toEqual({ attached: false, reason: "no_profile" });
  });

  it("compensates the link when a concurrent claim won the seeker write", async () => {
    seekerUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    expect(await attach()).toEqual({ attached: false, reason: "already_referred" });
    expect(linkUpdateOne).toHaveBeenCalledWith(
      { _id: LINK._id },
      { $inc: { usedCount: -1 }, $pull: { registrations: { jobSeekerId: SEEKER._id } } },
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("attributes a super-agent link to the super-agent, not an agent", async () => {
    linkFindOne.mockReturnValue(lean({
      ...LINK, creatorRole: "super_agent", agentId: undefined, superAgentId: "64d000000000000000000004",
    }));
    const result = await attach();
    expect(result).toMatchObject({ attached: true, referrerRole: "super_agent" });
    const referral = seekerUpdateOne.mock.calls[0][1].$set.referral;
    expect(referral.superAgentId).toBe("64d000000000000000000004");
    expect(referral.agentId).toBeUndefined();
  });

  it("still returns attached when the notification rejects", async () => {
    notify.mockRejectedValueOnce(new Error("smtp down"));
    await expect(attach()).resolves.toMatchObject({ attached: true });
  });
});

// Keeps this file a module: without it tsc puts `attach` in the global scope.
export {};
