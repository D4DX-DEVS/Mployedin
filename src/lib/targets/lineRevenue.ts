/** Pure (no server imports), shared by the KPI calculator and per-employer totals. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Value of one invoice line toward revenue: the line after the invoice's
 * discount, plus its share of the service charge, scaled by any partial refund.
 */
export function lineRevenue(input: {
  lineAmount: number;
  subtotal: number;
  discountPercent?: number;
  serviceCharge?: number;
  totalAmount?: number;
  refundedAmount?: number;
}): number {
  const { lineAmount, subtotal } = input;
  if (!(lineAmount > 0)) return 0;
  const afterDiscount = lineAmount * (1 - (input.discountPercent || 0) / 100);
  const share = subtotal > 0 ? lineAmount / subtotal : 0;
  const serviceShare = (input.serviceCharge || 0) * share;
  const total = input.totalAmount || 0;
  const refundFactor = total > 0 ? Math.max(0, 1 - (input.refundedAmount || 0) / total) : 1;
  return round2((afterDiscount + serviceShare) * refundFactor);
}
