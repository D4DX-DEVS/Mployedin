/**
 * POST /api/subscriptions/checkout — self-service plan purchase / change.
 *
 * Body: { planId }
 *
 * Gateway configured (PAYMENT_PROVIDER + keys):
 *   - new plan / upgrade → a pending subscription invoice is created (or an
 *     open one for the same plan+amount reused), priced with proration for a
 *     mid-period upgrade, and a hosted checkout session is opened for it:
 *       200 { checkoutUrl, sessionId, provider, invoiceId, amount, currency, credit }
 *     The plan changes ONLY when that invoice is paid (webhook / return-page
 *     confirmation → markInvoicePaid → applyPaidInvoiceToSubscription).
 *   - downgrade → nothing is charged; the change is stored as
 *     subscription.pendingPlanChange and applied by the subscription-expiry
 *     cron at the end of the paid period:
 *       200 { scheduled: true, effectiveAt }
 *   - past_due / suspended on the same plan → pays the open renewal invoice.
 *
 * No gateway → 503 { error: "payment_gateway_not_configured", plan } (the UI
 * shows the "Request upgrade" dialog).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { subscriptionCheckoutSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import { isPaymentGatewayEnabled } from "@/lib/payments";
import { startInvoiceCheckout } from "@/lib/payments/checkout";
import { applyPaidInvoiceToSubscription } from "@/lib/payments/subscriptionFulfillment";
import { PaymentProviderError } from "@/lib/payments/types";
import { computePlanChangeQuote } from "@/lib/subscription/proration";
import { calcEndDate } from "@/lib/subscription/helpers";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";
import logger from "@/lib/logger";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const OPEN_STATUSES = ["issued", "sent", "overdue", "partially_paid"];

async function handler(req: NextRequest, ctx: AuthCtx) {
  // JS-6: dual-keyed so neither a single account nor a single IP can hammer
  // plan lookups and gateway order creation.
  const { allowed } = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.checkout);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const targetRole =
    ctx.role === "employer" ? "employer" : ctx.role === "job_seeker" ? "job_seeker" : null;
  if (!targetRole) {
    return NextResponse.json({ error: "Not eligible for subscriptions" }, { status: 403 });
  }

  const body = await validateBody(req, subscriptionCheckoutSchema);

  await connectDB();
  const plan = await SubscriptionPlan.findOne({ _id: body.planId, targetRole, isActive: true }).lean();
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // ── No gateway → structured response the UI handles gracefully ───────────
  if (!isPaymentGatewayEnabled()) {
    return NextResponse.json(
      {
        error: "payment_gateway_not_configured",
        message:
          "Online payment is not yet available. Please contact your administrator to upgrade your plan.",
        plan: { id: String(plan._id), name: plan.name, price: plan.price, currency: plan.currency },
      },
      { status: 503 },
    );
  }

  const now = new Date();
  const current = await Subscription.findOne({
    userId: ctx.userId,
    targetRole,
    status: { $in: ["active", "past_due", "suspended"] },
  });

  const [user, employer] = await Promise.all([
    User.findById(ctx.userId).select("name email").lean(),
    targetRole === "employer"
      ? Employer.findOne({ userId: ctx.userId }).select("_id companyName companyEmail").lean()
      : Promise.resolve(null),
  ]);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const returnPath = targetRole === "employer" ? "/employer/subscription" : "/job-seeker/subscription";
  const checkoutOpts = {
    baseUrl,
    locale: ctx.locale || "en",
    returnPath,
    customerEmail: employer?.companyEmail || user?.email || "",
    customerName: employer?.companyName || user?.name || "",
    payerId: employer ? String(employer._id) : ctx.userId,
  };

  try {
    // ── Same plan: active → nothing to buy; lapsed → pay the open renewal ──
    if (current && String(current.planId) === String(plan._id)) {
      if (current.status === "active") {
        return NextResponse.json({ error: "You are already on this plan" }, { status: 400 });
      }
      const renewal = await Invoice.findOne({
        subscriptionId: current._id,
        type: "renewal",
        activationPending: true,
        status: { $in: OPEN_STATUSES },
      }).sort({ createdAt: -1 });
      if (renewal) {
        const session = await startInvoiceCheckout(renewal, { ...checkoutOpts, purpose: "subscription_renewal" });
        return NextResponse.json({ ...session, invoiceId: String(renewal._id) });
      }
    }

    const quote = computePlanChangeQuote(current?.status === "suspended" ? null : current, plan, now);

    // ── Downgrade → schedule for period end, charge nothing now ────────────
    if (quote.kind === "downgrade" && current) {
      current.pendingPlanChange = {
        planId: plan._id,
        planName: plan.name,
        requestedAt: now,
        requestedBy: ctx.userId as unknown as typeof current.userId,
        effectiveAt: quote.effectiveAt ?? current.endDate,
      };
      await current.save();
      await logActivity({
        ...actorFromCtx(ctx),
        action: "subscription.downgrade_scheduled",
        resource: "subscriptions",
        resourceId: String(current._id),
        meta: { fromPlan: current.planSnapshot?.name, toPlan: plan.name, effectiveAt: current.pendingPlanChange?.effectiveAt },
        req,
      });
      return NextResponse.json({ scheduled: true, effectiveAt: current.pendingPlanChange?.effectiveAt, planName: plan.name });
    }

    // Free plans are never charged: without a paid plan to step down from they
    // are activated via self-assign, not checkout.
    if (!(plan.price > 0)) {
      return NextResponse.json({ error: "Free plans are activated without checkout" }, { status: 400 });
    }

    // A newly chosen plan cancels a previously scheduled downgrade.
    if (current?.pendingPlanChange) {
      current.pendingPlanChange = undefined;
      await current.save();
    }

    const invoiceType = quote.kind === "new" || !current ? "new" : "upgrade";
    const purpose = invoiceType === "new" ? "subscription_new" : "subscription_change";

    // Reuse an open checkout invoice for the same plan + amount.
    const openCheckoutInvoices = await Invoice.find({
      userId: ctx.userId,
      category: "subscription",
      type: { $in: ["new", "upgrade", "downgrade"] },
      activationPending: true,
      paidAmount: { $lte: 0 },
      status: { $in: ["issued", "sent", "overdue"] },
    }).sort({ createdAt: -1 });

    let invoice = openCheckoutInvoices.find(
      (inv) => String(inv.planId) === String(plan._id) && Math.round(inv.totalAmount * 100) === Math.round(quote.amount * 100) && inv.currency === plan.currency,
    );

    // Stale ones (other plan / old price) whose session can no longer be paid
    // are cancelled so they don't linger as unpaid invoices.
    const stale = openCheckoutInvoices.filter(
      (inv) => inv !== invoice && (!inv.gatewaySession?.expiresAt || new Date(inv.gatewaySession.expiresAt).getTime() < now.getTime()),
    );
    if (stale.length) {
      await Invoice.updateMany(
        { _id: { $in: stale.map((i) => i._id) }, paidAmount: { $lte: 0 }, activationPending: true },
        { $set: { status: "cancelled", activationPending: false, internalNotes: "Abandoned online checkout" } },
      );
    }

    if (!invoice) {
      const periodEnd = calcEndDate(now, plan.billingCycle);
      const fromName = current?.planSnapshot?.name;
      invoice = await Invoice.create({
        invoiceNumber: await generateInvoiceNumber(),
        category: "subscription",
        userId: ctx.userId,
        employerId: employer?._id,
        subscriptionId: current?._id,
        planId: plan._id,
        planName: plan.name,
        billingCycle: plan.billingCycle,
        type: invoiceType,
        description:
          invoiceType === "new"
            ? `New subscription: ${plan.name} (${plan.billingCycle})`
            : `Upgrade: ${fromName ?? "current plan"} → ${plan.name}${quote.credit > 0 ? ` (credit ${plan.currency} ${quote.credit.toFixed(2)} for ${quote.remainingDays} unused days)` : ""}`,
        // Totals are derived from subtotal by Invoice.pre("save").
        subtotal: quote.amount,
        amount: quote.amount,
        currency: plan.currency,
        prorationCredit: quote.credit > 0 ? quote.credit : undefined,
        billingDetails: employer ? { companyName: employer.companyName, email: employer.companyEmail } : { contactPerson: user?.name, email: user?.email },
        periodStart: now,
        periodEnd,
        paymentTerms: "immediate",
        status: "issued",
        issuedAt: now,
        activationPending: true,
      });

      await logActivity({
        ...actorFromCtx(ctx),
        action: "subscription.checkout_invoice_created",
        resource: "invoices",
        resourceId: String(invoice._id),
        meta: { planName: plan.name, type: invoiceType, amount: quote.amount, credit: quote.credit, currency: plan.currency },
        req,
      });
    }

    // Credit covers the whole price → nothing to collect; apply now.
    if (!(quote.amount > 0)) {
      invoice.status = "paid";
      invoice.paidAt = now;
      await invoice.save();
      const applied = await applyPaidInvoiceToSubscription(invoice, { provider: "manual", paymentId: "PRORATION-CREDIT" });
      return NextResponse.json({ applied: applied.status === "applied", invoiceId: String(invoice._id) });
    }

    const session = await startInvoiceCheckout(invoice, { ...checkoutOpts, purpose });
    return NextResponse.json({
      ...session,
      invoiceId: String(invoice._id),
      credit: quote.credit,
    });
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      logger.error({ userId: ctx.userId, planId: String(plan._id), code: err.code, status: err.status }, "Checkout session creation failed");
      return NextResponse.json({ error: "checkout_failed", message: "Could not start checkout. Please try again." }, { status: 502 });
    }
    throw err;
  }
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
