import { formatCurrency as formatDashboardCurrency } from "@/lib/currency";
import { formatCurrency } from "@/lib/utils";

describe("formatCurrency", () => {
  it("can display an unambiguous currency code for financial dashboards", () => {
    expect(formatCurrency(15000, "INR", "en", "code")).toContain("INR");
    expect(formatCurrency(15000, "AED", "en", "code")).toContain("AED");
    expect(formatDashboardCurrency(15000, "INR", "code")).toBe("INR 15,000");
  });

  it("preserves symbol display by default", () => {
    expect(formatCurrency(25, "USD", "en")).toContain("$");
  });
});
