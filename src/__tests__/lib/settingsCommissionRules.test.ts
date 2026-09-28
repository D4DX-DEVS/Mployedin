/**
 * @jest-environment node
 *
 * Settings refuses commission rules that could never match an employer: a
 * typed country name, an empty country, or a second rule for one country.
 */
import { systemSettingsUpdateSchema } from "@/lib/validators/settings";

const parse = (commissionOverrides: unknown) => systemSettingsUpdateSchema.safeParse({ commissionOverrides });

describe("settings commission rules", () => {
  it("keeps an ISO code, upper-cased", () => {
    expect(parse([{ countryCode: "sa", rate: 4 }]).data?.commissionOverrides?.[0].countryCode).toBe("SA");
  });

  it.each([
    ["a typed country name", [{ countryCode: "Saudi Arabia", rate: 4 }]],
    ["an empty country", [{ countryCode: "", rate: 4 }]],
    ["two rules for one country", [{ countryCode: "AE", rate: 4 }, { countryCode: "ae", rate: 9 }]],
  ])("refuses %s", (_label, rules) => {
    expect(parse(rules).success).toBe(false);
  });
});
