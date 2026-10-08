/**
 * Payment gateway types — shared across Stripe, Razorpay, and future providers.
 */

export type PaymentProvider = "stripe" | "razorpay" | "manual";

export type PaymentMethodType =
  | "card"
  | "upi"
  | "bank_transfer"
  | "netbanking"
  | "wallet"
  | "cheque"
  | "cash"
  | "other";

export interface PaymentGatewayConfig {
  provider: PaymentProvider;
  publicKey: string;
  webhookSecret: string;
  currency: string;
  testMode: boolean;
}

/** What a checkout invoice pays for — carried in provider metadata for tracing. */
export type PaymentPurpose =
  | "subscription_new"
  | "subscription_change"
  | "subscription_renewal"
  | "invoice";

export interface CreatePaymentSessionInput {
  invoiceId: string;
  /** Payer id recorded in provider metadata (Employer _id when known, else the User _id). */
  employerId: string;
  /** Major units (e.g. 199.5 AED). Converted to minor units by the adapter. */
  amount: number;
  currency: string;
  description: string;
  customerEmail: string;
  customerName: string;
  metadata?: Record<string, string>;
  /** Stripe: `{CHECKOUT_SESSION_ID}` is appended by the adapter. */
  successUrl: string;
  cancelUrl: string;
  subscriptionId?: string;
  purpose?: PaymentPurpose;
  /** 1-based attempt counter per invoice — feeds idempotency keys / unique references. */
  attempt?: number;
  /** UI locale for the hosted page (en | ar). */
  locale?: string;
}

export interface PaymentSession {
  sessionId: string;
  provider: PaymentProvider;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: "created" | "pending" | "completed" | "failed" | "expired";
  expiresAt?: Date;
}

export interface PaymentRefundInfo {
  /** Provider refund id when the event names one (Razorpay refund.*). */
  refundId?: string;
  /** Amount of THIS refund, major units, when known. */
  amount?: number;
  /** Cumulative refunded amount on the payment, major units, when known. */
  cumulativeAmount?: number;
  /** True when the whole payment has been refunded. */
  full: boolean;
}

export interface PaymentWebhookEvent {
  provider: PaymentProvider;
  /** Provider event id — the idempotency key for webhook processing. */
  eventId: string;
  /** Raw provider event name (e.g. checkout.session.completed). */
  providerEventType: string;
  eventType: "payment.success" | "payment.failed" | "payment.refunded" | "ignored";
  paymentId: string;
  sessionId: string;
  amount: number;
  currency: string;
  method?: PaymentMethodType;
  metadata?: Record<string, string>;
  refund?: PaymentRefundInfo;
  failureReason?: string;
  rawPayload: unknown;
}

export interface WebhookHeaders {
  /** Razorpay sends the event id in `x-razorpay-event-id`. */
  eventId?: string | null;
}

export type VerifiedPaymentStatus = "paid" | "pending" | "failed" | "expired" | "open";

export interface VerifyPaymentResult {
  verified: boolean;
  status: VerifiedPaymentStatus;
  paymentId: string;
  sessionId: string;
  /** Invoice id recovered from provider-side metadata (server-set, trustworthy). */
  invoiceId?: string;
  amount: number;
  currency: string;
  method: PaymentMethodType;
  providerReference: string;
  error?: string;
}

export interface RefundInput {
  paymentId: string;
  amount: number;
  /** Needed for the minor-unit conversion; defaults to DEFAULT_CURRENCY. */
  currency?: string;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  error?: string;
}

export interface PaymentGateway {
  provider: PaymentProvider;
  createSession(input: CreatePaymentSessionInput): Promise<PaymentSession>;
  verifyWebhook(rawBody: string, signature: string, headers?: WebhookHeaders): Promise<PaymentWebhookEvent>;
  /**
   * Authoritative payment status from the provider API. `callbackParams` are the
   * query parameters the provider appended to the return URL (Razorpay signs them).
   */
  verifyPayment(sessionId: string, callbackParams?: Record<string, string>): Promise<VerifyPaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}

/** Thrown by adapters when a provider API call fails. Never contains secrets. */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/** Thrown by verifyWebhook on a missing / bad / stale signature. */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}
