import { employerTotals } from "@/lib/targets/agentEmployerKpis";

describe("agent's employers and commission", () => {
  const ME = "agent1";
  it("sums linked-line revenue (total minus tax) and only my commission, per currency", () => {
    const totals = employerTotals(
      [
        {
          employerId: "e1", currency: "AED", subtotal: 1000, serviceCharge: 100, totalAmount: 1150,
          lineItems: [{ amount: 1000, placementId: "p1" }],
          commissions: [
            { role: "agent", agentId: ME, amount: 50, status: "paid" },
            { role: "agent", agentId: "other", amount: 999, status: "paid" },
            { role: "super_agent", amount: 20, status: "pending" },
          ],
        },
        {
          employerId: "e1", currency: "INR", subtotal: 500, totalAmount: 500,
          lineItems: [{ amount: 500, placementId: "p2" }, { amount: 100 }],
          commissions: [{ role: "agent", agentId: ME, amount: 25, status: "disputed" }],
        },
      ],
      ME,
    );
    expect(totals.get("e1")).toEqual([
      { currency: "AED", revenue: 1100, commission: 50, commissionPaid: 50 },
      { currency: "INR", revenue: 500, commission: 0, commissionPaid: 0 },
    ]);
  });

  it("skips invoices with no employer", () => {
    expect(employerTotals([{ lineItems: [{ amount: 10, placementId: "p" }] }], ME).size).toBe(0);
  });
});
