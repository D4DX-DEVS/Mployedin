/**
 * @jest-environment jsdom
 *
 * Country commission rules are matched to employers by ISO code, so Settings
 * picks the country from a list (never a typed code) and refuses a rule with no
 * country or a second rule for the same country — only the first would apply.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";

import {
  CommissionCountryRules,
  commissionRuleProblem,
  type CommissionOverride,
} from "@/app/[locale]/(dashboard)/admin/settings/_components/CommissionCountryRules";

const optionsSeen: Array<Array<{ value: string; label: string }>> = [];
jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options, value, ariaLabel }: { options: Array<{ value: string; label: string }>; value: string; ariaLabel?: string }) => {
    optionsSeen.push(options);
    return <div role="combobox" aria-label={ariaLabel}>{options.find((o) => o.value === value)?.label ?? ""}</div>;
  },
}));

const rule = (countryCode: string, rate = 5): CommissionOverride => ({ countryCode, rate, label: "" });

describe("commission country rules", () => {
  beforeEach(() => {
    optionsSeen.length = 0;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ countries: [
        { code: "ae", name: "United Arab Emirates" }, { code: "SA", name: "Saudi Arabia" }, { code: "IN", name: "India" },
      ] }),
    }) as unknown as typeof fetch;
  });

  it("flags a rule with no country and a country used twice", () => {
    expect(commissionRuleProblem([rule("AE"), rule("SA")])).toBeNull();
    expect(commissionRuleProblem([rule("AE"), rule("")])).toBe("missingCountry");
    expect(commissionRuleProblem([rule("AE"), rule("AE", 9)])).toBe("duplicateCountry");
  });

  it("shows country names and offers each row only the countries not taken", async () => {
    await act(async () => {
      render(<CommissionCountryRules rules={[rule("AE"), rule("")]} onChange={jest.fn()} />);
    });
    expect(screen.getAllByRole("combobox", { name: "Country" })[0]).toHaveTextContent("United Arab Emirates");
    const [first, second] = optionsSeen.slice(-2);
    expect(first.map((o) => o.value)).toEqual(["AE", "SA", "IN"]);
    expect(second.map((o) => o.value)).toEqual(["SA", "IN"]);
    expect(screen.getByText(/applies to both the agent and the super agent/i)).toBeInTheDocument();
  });
});
