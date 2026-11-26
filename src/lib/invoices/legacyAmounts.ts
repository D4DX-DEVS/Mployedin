/**
 * AG-10: invoices written before the line-item model store only `amount`
 * (no totalAmount / paidAmount / balanceDue), so lists showed "AED 0".
 * Fill the missing money fields from `amount` and the status.
 */
export interface InvoiceMoneyFields {
  amount?: number | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  balanceDue?: number | null;
  status?: string | null;
}

const NO_BALANCE_STATUSES = new Set(["paid", "void", "cancelled", "refunded", "draft"]);

export function withLegacyInvoiceAmounts<T extends InvoiceMoneyFields>(inv: T): T {
  const total = inv.totalAmount && inv.totalAmount > 0 ? inv.totalAmount : (inv.amount ?? inv.totalAmount ?? 0);
  if (total === inv.totalAmount && inv.paidAmount != null && inv.balanceDue != null) return inv;
  const paid = inv.paidAmount ?? (inv.status === "paid" ? total : 0);
  const balance =
    inv.balanceDue != null && inv.totalAmount
      ? inv.balanceDue
      : NO_BALANCE_STATUSES.has(inv.status ?? "")
        ? 0
        : Math.max(0, total - paid);
  return { ...inv, totalAmount: total, paidAmount: paid, balanceDue: balance };
}
