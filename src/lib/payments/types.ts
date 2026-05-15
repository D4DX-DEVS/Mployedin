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

export interface CreatePaymentSessionInput {
  invoiceId: string;
  employerId: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail: string;
  customerName: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
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

export interface PaymentWebhookEvent {
  provider: PaymentProvider;
  eventType: "payment.success" | "payment.failed" | "payment.refunded";
  paymentId: string;
  sessionId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  rawPayload: unknown;
}

export interface VerifyPaymentResult {
  verified: boolean;
  paymentId: string;
  amount: number;
  currency: string;
  method: PaymentMethodType;
  providerReference: string;
  error?: string;
}

export interface RefundInput {
  paymentId: string;
  amount: number;
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
  verifyWebhook(rawBody: string, signature: string): Promise<PaymentWebhookEvent>;
  verifyPayment(sessionId: string): Promise<VerifyPaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
