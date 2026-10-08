/**
 * POST /api/invoices/[id]/pay — Open a hosted checkout (Stripe / Razorpay) for
 *                                the invoice's balance due.
 * GET  /api/invoices/[id]/pay — Is online payment available for this invoice?
 *
 * The amount is always the invoice's balance from the database. Access via
 * canAccessInvoice (owner, admin, scoped agent / super-agent).
 * No gateway → 501 { code: "GATEWAY_NOT_CONFIGURED" } (the UI falls back to
 * bank-transfer instructions).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { canAccessInvoice } from "@/lib/invoices/access";
import { PAYABLE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { isPaymentGatewayEnabled, getActiveProvider } from "@/lib/payments";
import { startInvoiceCheckout, invoiceBalance } from "@/lib/payments/checkout";
import { PaymentProviderError } from "@/lib/payments/types";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";
import logger from "@/lib/logger";

const PAYABLE = PAYABLE_INVOICE_STATUSES as readonly string[];

// ── GET: check if online payment is available ───────────────────────────────
async function getHandler(
  _req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  await connectDB();

  const invoice = await Invoice.findById(params?.id)
    .select("status userId agentId totalAmount amount paidAmount refundedAmount balanceDue currency")
    .lean();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const gatewayEnabled = isPaymentGatewayEnabled();
  const balance = invoiceBalance(invoice);

  return NextResponse.json({
    gatewayEnabled,
    provider: gatewayEnabled ? getActiveProvider() : null,
    canPay: PAYABLE.includes(invoice.status) && balance > 0,
    balance,
    currency: invoice.currency,
  });
}

// ── POST: create payment session ────────────────────────────────────────────
async function postHandler(
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  if (!isPaymentGatewayEnabled()) {
    return NextResponse.json({
      error: "Online payment is not yet configured. Please use bank transfer or contact support.",
      code: "GATEWAY_NOT_CONFIGURED",
    }, { status: 501 });
  }

  const { allowed } = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.checkout);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  await connectDB();

  const invoice = await Invoice.findById(params?.id)
    .select("_id invoiceNumber userId agentId employerId subscriptionId category type status totalAmount amount paidAmount refundedAmount currency description planName gatewaySession billingDetails")
    .lean();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!PAYABLE.includes(invoice.status)) {
    return NextResponse.json({ error: `Cannot pay invoice with status: ${invoice.status}` }, { status: 400 });
  }
  if (invoiceBalance(invoice) <= 0) {
    return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 400 });
  }

  const [owner, employer] = await Promise.all([
    User.findById(invoice.userId).select("name email role").lean(),
    invoice.employerId
      ? Employer.findById(invoice.employerId).select("_id companyName companyEmail").lean()
      : Employer.findOne({ userId: invoice.userId }).select("_id companyName companyEmail").lean(),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  // Return to where the payer started: job seekers only have the subscription page.
  const returnPath = owner?.role === "job_seeker" ? "/job-seeker/subscription" : "/employer/invoices";
  const purpose = invoice.category === "subscription" && invoice.type === "renewal"
    ? "subscription_renewal"
    : invoice.category === "subscription" && ["new", "upgrade", "downgrade"].includes(invoice.type)
      ? (invoice.type === "new" ? "subscription_new" : "subscription_change")
      : "invoice";

  try {
    const session = await startInvoiceCheckout(invoice, {
      baseUrl,
      locale: ctx.locale || "en",
      returnPath,
      customerEmail: invoice.billingDetails?.email || employer?.companyEmail || owner?.email || "",
      customerName: invoice.billingDetails?.companyName || employer?.companyName || owner?.name || "",
      payerId: employer ? String(employer._id) : String(invoice.userId),
      purpose,
    });

    return NextResponse.json({
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      provider: session.provider,
      amount: session.amount,
      currency: session.currency,
    });
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      logger.error({ invoiceId: String(invoice._id), code: err.code, status: err.status }, "Invoice checkout session creation failed");
      return NextResponse.json({ error: "Could not start online payment. Please try again." }, { status: 502 });
    }
    throw err;
  }
}

export const GET = withAuth(getHandler, { resource: "invoices", action: "read" });
export const POST = withAuth(postHandler, { resource: "invoices", action: "read" });
