/**
 * GET /api/payments/confirm — return-page payment confirmation.
 *
 * Called by the subscription / invoices pages when the provider redirects the
 * payer back:
 *   Stripe:   ?session_id=cs_…
 *   Razorpay: ?razorpay_payment_link_id=plink_…&razorpay_payment_id=…
 *             &razorpay_payment_link_reference_id=…&razorpay_payment_link_status=…
 *             &razorpay_signature=…
 *
 * Asks the provider API for the authoritative status (never trusts the query
 * string or client amounts) and, if paid but the webhook hasn't landed yet,
 * runs the same idempotent markInvoicePaid the webhook uses — so the payer
 * sees "Payment received" immediately and the webhook later becomes a no-op.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { canAccessInvoice } from "@/lib/invoices/access";
import { getPaymentGateway, isPaymentGatewayEnabled } from "@/lib/payments";
import { markInvoicePaid } from "@/lib/payments/markInvoicePaid";
import { PaymentProviderError } from "@/lib/payments/types";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import logger from "@/lib/logger";

type ConfirmStatus = "paid" | "pending" | "failed" | "cancelled";

const RAZORPAY_PARAMS = [
  "razorpay_payment_id",
  "razorpay_payment_link_id",
  "razorpay_payment_link_reference_id",
  "razorpay_payment_link_status",
  "razorpay_signature",
] as const;

async function handler(req: NextRequest, ctx: AuthContext) {
  const { allowed } = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.paymentConfirm);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  if (!isPaymentGatewayEnabled()) {
    return NextResponse.json({ error: "payment_gateway_not_configured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const gateway = getPaymentGateway();

  let sessionId: string | null = null;
  let callbackParams: Record<string, string> | undefined;
  if (gateway.provider === "stripe") {
    sessionId = sp.get("session_id");
  } else {
    sessionId = sp.get("razorpay_payment_link_id");
    callbackParams = {};
    for (const key of RAZORPAY_PARAMS) {
      const v = sp.get(key);
      if (v) callbackParams[key] = v.slice(0, 200);
    }
  }
  if (!sessionId || sessionId.length > 200) {
    return NextResponse.json({ error: "Missing payment session reference" }, { status: 400 });
  }

  let verification;
  try {
    verification = await gateway.verifyPayment(sessionId, callbackParams);
  } catch (err) {
    const status = err instanceof PaymentProviderError && err.status === 404 ? 404 : 502;
    logger.warn({ provider: gateway.provider, sessionId, reason: err instanceof Error ? err.message : "unknown" }, "Payment confirmation lookup failed");
    return NextResponse.json({ error: "Could not confirm the payment with the provider" }, { status });
  }

  if (verification.error === "invalid_signature" || verification.error === "invalid_session_id") {
    return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
  }

  await connectDB();
  // Locate the invoice by provider-side metadata first, then by the stored session.
  const invoice = verification.invoiceId && /^[a-f\d]{24}$/i.test(verification.invoiceId)
    ? await Invoice.findById(verification.invoiceId).select("_id userId agentId invoiceNumber status balanceDue currency gatewaySession").lean()
    : await Invoice.findOne({ "gatewaySession.sessionId": verification.sessionId }).select("_id userId agentId invoiceNumber status balanceDue currency gatewaySession").lean();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const base = { invoiceId: String(invoice._id), invoiceNumber: invoice.invoiceNumber, provider: gateway.provider };

  if (!verification.verified) {
    const status: ConfirmStatus =
      verification.status === "pending" ? "pending"
      : verification.status === "failed" ? "failed"
      : "cancelled"; // open (abandoned) or expired
    return NextResponse.json({ ...base, status, invoiceStatus: invoice.status });
  }

  const result = await markInvoicePaid(String(invoice._id), {
    provider: gateway.provider,
    paymentId: verification.paymentId,
    amount: verification.amount,
    currency: verification.currency,
    method: verification.method,
  });

  if (result.status === "rejected" || result.status === "not_found" || result.status === "conflict") {
    // Paid at the provider but not applicable here (e.g. already paid by a
    // second tab). The webhook path logs + audits the same case for refund.
    logger.error({ ...base, paymentId: verification.paymentId, reason: result.reason ?? result.status }, "Confirmed payment could not be applied");
    return NextResponse.json({ ...base, status: "paid", applied: false, reason: result.reason ?? result.status, invoiceStatus: result.invoiceStatus ?? invoice.status });
  }

  return NextResponse.json({
    ...base,
    status: "paid" satisfies ConfirmStatus,
    applied: true,
    invoiceStatus: result.invoiceStatus,
    balanceDue: result.balanceDue,
    subscription: result.subscription?.status,
  });
}

export const GET = withAuth(handler, { resource: "invoices", action: "read" });
