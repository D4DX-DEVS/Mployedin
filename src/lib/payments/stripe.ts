/**
 * Stripe payment gateway adapter.
 *
 * STUB — replace with real Stripe SDK calls when ready.
 * Install: npm i stripe
 * Env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
 */

import type {
  PaymentGateway,
  CreatePaymentSessionInput,
  PaymentSession,
  PaymentWebhookEvent,
  VerifyPaymentResult,
  RefundInput,
  RefundResult,
} from "./types";

export class StripeGateway implements PaymentGateway {
  provider = "stripe" as const;

  // private stripe: Stripe;
  // constructor() {
  //   this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });
  // }

  async createSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    // TODO: Replace with real Stripe Checkout Session
    //
    // const session = await this.stripe.checkout.sessions.create({
    //   mode: "payment",
    //   payment_method_types: ["card"],
    //   customer_email: input.customerEmail,
    //   line_items: [{
    //     price_data: {
    //       currency: input.currency.toLowerCase(),
    //       product_data: { name: input.description },
    //       unit_amount: Math.round(input.amount * 100),
    //     },
    //     quantity: 1,
    //   }],
    //   metadata: { invoiceId: input.invoiceId, employerId: input.employerId, ...input.metadata },
    //   success_url: input.successUrl,
    //   cancel_url: input.cancelUrl,
    // });
    //
    // return {
    //   sessionId: session.id,
    //   provider: "stripe",
    //   checkoutUrl: session.url!,
    //   amount: input.amount,
    //   currency: input.currency,
    //   status: "created",
    //   expiresAt: new Date(session.expires_at * 1000),
    // };

    void input;
    throw new Error("Stripe integration not yet configured. Set STRIPE_SECRET_KEY to enable.");
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<PaymentWebhookEvent> {
    // TODO: Replace with real webhook verification
    //
    // const event = this.stripe.webhooks.constructEvent(
    //   rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!,
    // );
    // const session = event.data.object as Stripe.Checkout.Session;
    //
    // let eventType: PaymentWebhookEvent["eventType"] = "payment.failed";
    // if (event.type === "checkout.session.completed") eventType = "payment.success";
    // if (event.type === "charge.refunded") eventType = "payment.refunded";
    //
    // return {
    //   provider: "stripe",
    //   eventType,
    //   paymentId: session.payment_intent as string,
    //   sessionId: session.id,
    //   amount: (session.amount_total ?? 0) / 100,
    //   currency: session.currency?.toUpperCase() ?? "USD",
    //   metadata: session.metadata as Record<string, string>,
    //   rawPayload: event,
    // };

    void rawBody;
    void signature;
    throw new Error("Stripe webhook verification not yet configured.");
  }

  async verifyPayment(sessionId: string): Promise<VerifyPaymentResult> {
    // TODO: Replace with real payment verification
    //
    // const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
    //   expand: ["payment_intent.latest_charge"],
    // });
    //
    // return {
    //   verified: session.payment_status === "paid",
    //   paymentId: session.payment_intent as string,
    //   amount: (session.amount_total ?? 0) / 100,
    //   currency: session.currency?.toUpperCase() ?? "USD",
    //   method: "card",
    //   providerReference: session.id,
    // };

    void sessionId;
    throw new Error("Stripe payment verification not yet configured.");
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // TODO: Replace with real refund
    //
    // const refund = await this.stripe.refunds.create({
    //   payment_intent: input.paymentId,
    //   amount: Math.round(input.amount * 100),
    //   reason: "requested_by_customer",
    //   metadata: { reason: input.reason },
    // });
    //
    // return {
    //   refundId: refund.id,
    //   amount: (refund.amount ?? 0) / 100,
    //   status: refund.status === "succeeded" ? "processed" : "pending",
    // };

    void input;
    throw new Error("Stripe refunds not yet configured.");
  }
}
