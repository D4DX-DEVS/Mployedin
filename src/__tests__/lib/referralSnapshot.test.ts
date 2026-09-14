import { resolveApplicationReferralFlag } from "@/lib/applications/referralSnapshot";

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
