import {
  applicationSnapshotFlags,
  resolveApplicationPriorityFlag,
  resolveApplicationReferralFlag,
} from "@/lib/applications/referralSnapshot";

function doc(overrides: Partial<{ isNew: boolean; modified: boolean; jobSeekerId: string }> = {}) {
  const { isNew = true, modified = false, jobSeekerId = "seeker_1" } = overrides;
  return { isNew, jobSeekerId, isModified: (path: string) => path === "isAgentReferred" && modified };
}

describe("resolveApplicationReferralFlag", () => {
  it("copies the seeker's flag onto a new application", async () => {
    const lookup = jest.fn(async () => true);
    await expect(resolveApplicationReferralFlag(doc(), lookup)).resolves.toBe(true);
    expect(lookup).toHaveBeenCalledWith("seeker_1");
  });

  it("returns false when the seeker is not referred or cannot be found", async () => {
    await expect(resolveApplicationReferralFlag(doc(), async () => false)).resolves.toBe(false);
  });

  it("leaves an explicitly provided value alone and skips the lookup", async () => {
    const lookup = jest.fn(async () => true);
    await expect(resolveApplicationReferralFlag(doc({ modified: true }), lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("never touches an existing application", async () => {
    const lookup = jest.fn(async () => true);
    await expect(resolveApplicationReferralFlag(doc({ isNew: false }), lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});

// Client decision 2026-10-12: a Premium job seeker's applications are
// priority — reviewed first, like referred ones, and badged for the reviewer.
describe("resolveApplicationPriorityFlag", () => {
  const priorityDoc = (overrides: Partial<{ isNew: boolean; modified: boolean }> = {}) => {
    const { isNew = true, modified = false } = overrides;
    return { isNew, jobSeekerId: "seeker_1", isModified: (path: string) => path === "isPriority" && modified };
  };

  it("marks a new application priority when the seeker is Premium", async () => {
    await expect(resolveApplicationPriorityFlag(priorityDoc(), async () => true)).resolves.toBe(true);
    await expect(resolveApplicationPriorityFlag(priorityDoc(), async () => false)).resolves.toBe(false);
  });

  it("leaves an explicit value and existing applications alone", async () => {
    const lookup = jest.fn(async () => true);
    await expect(resolveApplicationPriorityFlag(priorityDoc({ modified: true }), lookup)).resolves.toBeUndefined();
    await expect(resolveApplicationPriorityFlag(priorityDoc({ isNew: false }), lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("applicationSnapshotFlags", () => {
  it("reads both flags off the seeker an apply route already holds", () => {
    expect(applicationSnapshotFlags({ isAgentReferred: true, badges: ["premium"] })).toEqual({ isAgentReferred: true, isPriority: true });
    expect(applicationSnapshotFlags({ badges: ["verified"] })).toEqual({ isAgentReferred: false, isPriority: false });
    expect(applicationSnapshotFlags(null)).toEqual({ isAgentReferred: false, isPriority: false });
  });
});
