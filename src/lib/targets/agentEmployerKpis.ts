/**
 * "My employers and commission" for an agent's target report
 * (docs/plans/2026-11-18-target-management-v2.md): per employer they own, the
 * commission rate in effect today, invoiced revenue (linked hire lines, by
 * invoice issue date, total minus tax — the same rule as the KPI calculator)
 * and the agent's own commission on those invoices. Per currency, never added
 * across currencies.
 */
import { lineRevenue } from "./lineRevenue";

export const REVENUE_INVOICE_STATUSES = ["issued", "sent", "paid", "partially_paid", "overdue"];

export interface EmployerInvoice {
  employerId?: unknown;
  currency?: string;
  subtotal?: number;
  discountPercent?: number;
  serviceCharge?: number;
  totalAmount?: number;
  refundedAmount?: number;
  lineItems?: { amount: number; placementId?: unknown }[];
  commissions?: { role: string; agentId?: unknown; amount: number; status: string }[];
}

export interface EmployerMoney {
  currency: string;
  revenue: number;
  commission: number;
  commissionPaid: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Revenue and the agent's own commission per employer and currency. */
export function employerTotals(invoices: EmployerInvoice[], agentId: string): Map<string, EmployerMoney[]> {
  const byEmployer = new Map<string, Map<string, EmployerMoney>>();
  for (const inv of invoices) {
    if (!inv.employerId) continue;
    const currency = inv.currency || "AED";
    const employerKey = String(inv.employerId);
    const perCurrency = byEmployer.get(employerKey) ?? new Map<string, EmployerMoney>();
    const row = perCurrency.get(currency) ?? { currency, revenue: 0, commission: 0, commissionPaid: 0 };
    for (const line of inv.lineItems ?? []) {
      if (!line.placementId) continue;
      row.revenue = round2(
        row.revenue +
          lineRevenue({
            lineAmount: line.amount,
            subtotal: inv.subtotal ?? 0,
            discountPercent: inv.discountPercent,
            serviceCharge: inv.serviceCharge,
            totalAmount: inv.totalAmount,
            refundedAmount: inv.refundedAmount,
          }),
      );
    }
    for (const c of inv.commissions ?? []) {
      if (c.role !== "agent" || String(c.agentId) !== agentId || c.status === "disputed") continue;
      row.commission = round2(row.commission + (c.amount || 0));
      if (c.status === "paid") row.commissionPaid = round2(row.commissionPaid + (c.amount || 0));
    }
    perCurrency.set(currency, row);
    byEmployer.set(employerKey, perCurrency);
  }
  return new Map([...byEmployer].map(([k, v]) => [k, [...v.values()].sort((a, b) => b.revenue - a.revenue)]));
}
