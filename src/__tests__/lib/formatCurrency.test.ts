import { formatCurrency as formatDashboardCurrency } from "@/lib/currency";

describe("formatCurrency", () => {
  it("can display an unambiguous currency code for financial dashboards", () => {
    expect(formatDashboardCurrency(15000, "INR", "code")).toBe("INR 15,000");
    expect(formatDashboardCurrency(15000, "AED", "code")).toBe("AED 15,000");
  });

  it("preserves symbol display by default", () => {
    expect(formatDashboardCurrency(25, "USD")).toContain("$");
  });

  it("returns an em dash for missing values instead of throwing", () => {
    expect(formatDashboardCurrency(null)).toBe("—");
    expect(formatDashboardCurrency("")).toBe("—");
  });
});
