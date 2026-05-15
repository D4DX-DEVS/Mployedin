/**
 * Razorpay payment gateway adapter.
 *
 * STUB — replace with real Razorpay SDK calls when ready.
 * Install: npm i razorpay
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
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

export class RazorpayGateway implements PaymentGateway {
  provider = "razorpay" as const;

  // private razorpay: Razorpay;
  // constructor() {
  //   this.razorpay = new Razorpay({
  //     key_id: process.env.RAZORPAY_KEY_ID!,
  //     key_secret: process.env.RAZORPAY_KEY_SECRET!,
  //   });
  // }

  async createSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    // TODO: Replace with real Razorpay Order creation
    //
    // const order = await this.razorpay.orders.create({
    //   amount: Math.round(input.amount * 100), // paise
    //   currency: input.currency,
    //   receipt: input.invoiceId,
    //   notes: { invoiceId: input.invoiceId, employerId: input.employerId, ...input.metadata },
    // });
    //
    // For Razorpay, the checkout happens client-side with the order ID.
    // The "checkoutUrl" isn't a redirect but the order ID for the JS SDK.
    //
    // return {
    //   sessionId: order.id,
    //   provider: "razorpay",
    //   checkoutUrl: order.id, // Used by client-side Razorpay SDK
    //   amount: input.amount,
    //   currency: input.currency,
    //   status: "created",
    // };

    void input;
    throw new Error("Razorpay integration not yet configured. Set RAZORPAY_KEY_ID to enable.");
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<PaymentWebhookEvent> {
    // TODO: Replace with real webhook verification
    //
    // const crypto = await import("crypto");
    // const expectedSignature = crypto
    //   .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    //   .update(rawBody)
    //   .digest("hex");
    //
    // if (expectedSignature !== signature) {
    //   throw new Error("Invalid Razorpay webhook signature");
    // }
    //
    // const event = JSON.parse(rawBody);
    // const payment = event.payload.payment.entity;
    //
    // return {
    //   provider: "razorpay",
    //   eventType: event.event === "payment.captured" ? "payment.success" : "payment.failed",
    //   paymentId: payment.id,
    //   sessionId: payment.order_id,
    //   amount: payment.amount / 100,
    //   currency: payment.currency,
    //   metadata: payment.notes,
    //   rawPayload: event,
    // };

    void rawBody;
    void signature;
    throw new Error("Razorpay webhook verification not yet configured.");
  }

  async verifyPayment(sessionId: string): Promise<VerifyPaymentResult> {
    // TODO: Replace with real payment verification
    //
    // const order = await this.razorpay.orders.fetch(sessionId);
    // const payments = await this.razorpay.orders.fetchPayments(sessionId);
    // const captured = payments.items?.find((p: any) => p.status === "captured");
    //
    // return {
    //   verified: order.status === "paid" && !!captured,
    //   paymentId: captured?.id ?? "",
    //   amount: order.amount / 100,
    //   currency: order.currency,
    //   method: mapRazorpayMethod(captured?.method),
    //   providerReference: captured?.id ?? sessionId,
    // };

    void sessionId;
    throw new Error("Razorpay payment verification not yet configured.");
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // TODO: Replace with real refund
    //
    // const refund = await this.razorpay.payments.refund(input.paymentId, {
    //   amount: Math.round(input.amount * 100),
    //   notes: { reason: input.reason },
    // });
    //
    // return {
    //   refundId: refund.id,
    //   amount: refund.amount / 100,
    //   status: refund.status === "processed" ? "processed" : "pending",
    // };

    void input;
    throw new Error("Razorpay refunds not yet configured.");
  }
}
