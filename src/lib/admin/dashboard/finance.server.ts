import Commission from "@/models/Commission";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import { INVOICE_STATUSES, NON_REVENUE_INVOICE_STATUSES, PAYABLE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { INVOICE_DISPUTE_OPEN_FILTER, PAYMENT_NOTICE_PENDING_FILTER } from "@/lib/admin/queueFilters";
import type { DashboardPeriod } from "./period";
import type { FinanceOverview, MoneyByCurrency, PaymentsMoney, SubscriptionPlanCount } from "./types";

/** Invoices fall back to AED when a legacy row has no currency; commissions default to AED in the schema. */
const currencyOf = (value: string | null | undefined) => value || "AED";

async function getMoney(period: DashboardPeriod): Promise<MoneyByCurrency[]> {
  const { start } = period;
  const [owedRows, collectedRows] = await Promise.all([
    Invoice.aggregate<{ _id: string; outstanding: number; overdue: number }>([
      { $match: { status: { $in: [...PAYABLE_INVOICE_STATUSES] } } },
      {
        $group: {
          _id: "$currency",
          outstanding: { $sum: "$balanceDue" },
          overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, "$balanceDue", 0] } },
        },
      },
    ]),
    Invoice.aggregate<{ _id: string; collected: number }>([
      { $match: { status: { $nin: NON_REVENUE_INVOICE_STATUSES }, "payments.paymentDate": { $gte: start } } },
      { $unwind: "$payments" },
      { $match: { "payments.paymentDate": { $gte: start } } },
      { $group: { _id: "$currency", collected: { $sum: "$payments.amount" } } },
    ]),
  ]);

  // Never summed across currencies: invoices follow their issuer's currency.
  const byCurrency = new Map<string, MoneyByCurrency>();
  const entry = (currency: string) => {
    const key = currencyOf(currency);
    const existing = byCurrency.get(key);
    if (existing) return existing;
    const created: MoneyByCurrency = { currency: key, outstanding: 0, overdue: 0, collected: 0 };
    byCurrency.set(key, created);
    return created;
  };
  for (const row of owedRows) {
    const target = entry(row._id);
    target.outstanding += row.outstanding;
    target.overdue += row.overdue;
  }
  for (const row of collectedRows) entry(row._id).collected += row.collected;

  return [...byCurrency.values()]
    .filter((row) => row.outstanding > 0 || row.collected > 0)
    .sort((left, right) => right.outstanding - left.outstanding);
}

/**
 * Money waiting on a payment check and commission money by state, per
 * currency. The action queue already counts these items; this is the amount.
 */
async function getPaymentsMoney(period: DashboardPeriod): Promise<PaymentsMoney[]> {
  const { start } = period;
  const [noticeRows, commissionRows] = await Promise.all([
    Invoice.aggregate<{ _id: string; amount: number }>([
      { $match: PAYMENT_NOTICE_PENDING_FILTER },
      { $group: { _id: "$currency", amount: { $sum: "$balanceDue" } } },
    ]),
    Commission.aggregate<{ _id: { currency: string; status: string }; amount: number }>([
      {
        $match: {
          $or: [{ status: { $in: ["pending", "approved", "disputed"] } }, { status: "paid", paidAt: { $gte: start } }],
        },
      },
      { $group: { _id: { currency: "$currency", status: "$status" }, amount: { $sum: "$amount" } } },
    ]),
  ]);

  const byCurrency = new Map<string, PaymentsMoney>();
  const entry = (currency: string) => {
    const key = currencyOf(currency);
    const existing = byCurrency.get(key);
    if (existing) return existing;
    const created: PaymentsMoney = {
      currency: key,
      awaitingVerification: 0,
      commissionPending: 0,
      commissionApproved: 0,
      commissionDisputed: 0,
      commissionPaid: 0,
    };
    byCurrency.set(key, created);
    return created;
  };
  for (const row of noticeRows) entry(row._id).awaitingVerification += row.amount;
  const field = { pending: "commissionPending", approved: "commissionApproved", disputed: "commissionDisputed", paid: "commissionPaid" } as const;
  for (const row of commissionRows) {
    const key = field[row._id.status as keyof typeof field];
    if (key) entry(row._id.currency)[key] += row.amount;
  }
  return [...byCurrency.values()];
}

export async function getFinanceOverview(period: DashboardPeriod, access: { commissions: boolean }): Promise<FinanceOverview> {
  const { now, start } = period;
  const [money, statusRows, openDisputes, activeSubscriptions, planRows, expiredInPeriod, cancelledInPeriod, payments] =
    await Promise.all([
      getMoney(period),
      Invoice.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Invoice.countDocuments(INVOICE_DISPUTE_OPEN_FILTER),
      Subscription.countDocuments({ status: "active" }),
      Subscription.aggregate<{ _id: { role: "employer" | "job_seeker"; name: string; tier: number }; count: number }>([
        { $match: { status: "active" } },
        {
          $group: {
            _id: { role: "$targetRole", name: "$planSnapshot.name", tier: "$planSnapshot.tier" },
            count: { $sum: 1 },
          },
        },
      ]),
      Subscription.countDocuments({ status: "expired", endDate: { $gte: start, $lte: now } }),
      Subscription.countDocuments({ status: "cancelled", cancelledAt: { $gte: start } }),
      access.commissions ? getPaymentsMoney(period) : null,
    ]);

  const byStatus = new Map(statusRows.map((row) => [row._id, row.count]));
  const invoiceStatuses = INVOICE_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));

  const plans: SubscriptionPlanCount[] = planRows
    .map((row) => ({ role: row._id.role, name: row._id.name ?? "", tier: row._id.tier ?? 0, count: row.count }))
    .sort((left, right) => (left.role === right.role ? left.tier - right.tier : left.role === "employer" ? -1 : 1));

  return {
    money,
    invoiceStatuses,
    totalInvoices: statusRows.reduce((sum, row) => sum + row.count, 0),
    openDisputes,
    activeSubscriptions,
    plans,
    expiredInPeriod,
    cancelledInPeriod,
    payments,
  };
}
