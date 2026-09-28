/**
 * @jest-environment node
 */
/**
 * Country commission rules are keyed by ISO code in Settings ("SA"), while
 * employers store their country however it was entered: "SA", "Saudi Arabia",
 * "KSA". The rule must apply to every spelling of the same country.
 */

const settingsFindOne = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => settingsFindOne(...args) },
}));

import {
  clearCommissionOverrideCache,
  resolveCommissionRate,
  resolveOverrideRate,
} from "@/lib/commissions/resolveRate";

function mockOverrides(commissionOverrides: Record<string, unknown>[]) {
  settingsFindOne.mockReturnValue({ select: () => ({ lean: async () => ({ commissionOverrides }) }) });
}

describe("country commission rules", () => {
  beforeEach(() => {
    clearCommissionOverrideCache();
    settingsFindOne.mockReset();
    mockOverrides([
      { countryCode: "SA", rate: 4 },
      { countryCode: "AE", rate: 15, agentRate: 7, superAgentRate: 3 },
      { countryCode: "ZA", rate: 6 },
    ]);
  });

  it.each(["SA", "sa", "Saudi Arabia", "saudi arabia ", "KSA", "Saudi Arabia (Transferable Iqama)"])(
    "applies the SA rule to an employer stored as %p",
    async (country) => {
      await expect(resolveCommissionRate(10, country)).resolves.toEqual({
        rate: 4,
        source: "country_override",
        countryCode: "SA",
      });
    },
  );

  it.each(["AE", "UAE", "United Arab Emirates", "u.a.e"])(
    "applies the role-specific AE rates to an employer stored as %p",
    async (country) => {
      await expect(resolveCommissionRate(10, country)).resolves.toMatchObject({ rate: 7, countryCode: "AE" });
      await expect(resolveOverrideRate(15, country)).resolves.toMatchObject({ rate: 3, countryCode: "AE" });
    },
  );

  it("matches countries outside the alias list by their English name", async () => {
    await expect(resolveCommissionRate(10, "South Africa")).resolves.toMatchObject({ rate: 6, countryCode: "ZA" });
    await expect(resolveCommissionRate(10, "ZA")).resolves.toMatchObject({ rate: 6, countryCode: "ZA" });
  });

  it("falls back to the profile rate when no rule names the employer's country", async () => {
    await expect(resolveCommissionRate(10, "India")).resolves.toEqual({ rate: 10, source: "agent_default" });
    await expect(resolveOverrideRate(15, "Kerala")).resolves.toEqual({ rate: 15, source: "super_agent_default" });
  });

  it("uses the profile rate when the employer has no country", async () => {
    await expect(resolveCommissionRate(10, null)).resolves.toEqual({ rate: 10, source: "agent_default" });
    await expect(resolveCommissionRate(10, "  ")).resolves.toEqual({ rate: 10, source: "agent_default" });
    expect(settingsFindOne).not.toHaveBeenCalled();
  });
});
