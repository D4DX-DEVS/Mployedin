/**
 * POST /api/invoices/[id]/pay — Create a payment session for online payment.
 * GET  /api/invoices/[id]/pay — Check payment gateway availability + config.
 *
 * Returns checkout URL for Stripe/Razorpay when configured,
 * or a 501 indicating manual payment is required.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { canAccessInvoice } from "@/lib/invoices/access";
import { isPaymentGatewayEnabled, getPaymentGateway, getActiveProvider } from "@/lib/payments";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";

const PAYABLE_STATUSES = ["issued", "sent", "partially_paid", "overdue"];

// ── GET: check if online payment is available ───────────────────────────────
async function getHandler(
  _req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  await connectDB();

  const invoice = await Invoice.findById(params?.id).select("status userId totalAmount paidAmount balanceDue currency").lean();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const gatewayEnabled = isPaymentGatewayEnabled();
  const balance = invoice.balanceDue ?? (invoice.totalAmount - (invoice.paidAmount ?? 0));

  return NextResponse.json({
    gatewayEnabled,
    provider: gatewayEnabled ? getActiveProvider() : null,
    canPay: PAYABLE_STATUSES.includes(invoice.status) && balance > 0,
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
  await connectDB();

  if (!isPaymentGatewayEnabled()) {
    return NextResponse.json({
      error: "Online payment is not yet configured. Please use bank transfer or contact support.",
      code: "GATEWAY_NOT_CONFIGURED",
    }, { status: 501 });
  }

  const invoice = await Invoice.findById(params?.id)
    .populate("employerId", "companyName companyEmail")
    .lean();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json({ error: `Cannot pay invoice with status: ${invoice.status}` }, { status: 400 });
  }

  const balance = invoice.balanceDue ?? (invoice.totalAmount - (invoice.paidAmount ?? 0));
  if (balance <= 0) {
    return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 400 });
  }

  const gateway = getPaymentGateway();
  const employer = invoice.employerId as { companyName?: string; companyEmail?: string } | undefined;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

  const session = await gateway.createSession({
    invoiceId: String(invoice._id),
    employerId: String(invoice.employerId),
    amount: balance,
    currency: invoice.currency ?? "USD",
    description: `Invoice ${invoice.invoiceNumber} — ${employer?.companyName ?? ""}`,
    customerEmail: employer?.companyEmail ?? "",
    customerName: employer?.companyName ?? "",
    metadata: {
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
    },
    successUrl: `${baseUrl}/en/employer/invoices?payment=success&invoice=${invoice.invoiceNumber}`,
    cancelUrl: `${baseUrl}/en/employer/invoices?payment=cancelled&invoice=${invoice.invoiceNumber}`,
  });

  return NextResponse.json({
    checkoutUrl: session.checkoutUrl,
    sessionId: session.sessionId,
    provider: session.provider,
    amount: session.amount,
    currency: session.currency,
  });
}

export const GET = withAuth(getHandler, { resource: "invoices", action: "read" });
export const POST = withAuth(postHandler, { resource: "invoices", action: "read" });
