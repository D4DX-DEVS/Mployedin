/**
 * Payment gateway factory — resolves the active gateway based on env config.
 *
 * Usage:
 *   const gateway = getPaymentGateway();
 *   const session = await gateway.createSession({ ... });
 *
 * Configuration (see docs/PAYMENTS.md):
 *   PAYMENT_PROVIDER=stripe|razorpay  (unset / "manual" → manual payments only)
 *   stripe:   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 *   razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID
 *
 * A gateway counts as enabled once the provider is selected AND its server-side
 * API credentials are present. Everything else degrades to the manual flow.
 */

import type { PaymentGateway, PaymentProvider, PaymentGatewayConfig } from "./types";
import { StripeGateway } from "./stripe";
import { RazorpayGateway } from "./razorpay";

let _cachedGateway: PaymentGateway | null = null;
let _cachedFor: PaymentProvider | null = null;

/** Returns the configured payment provider or null if manual-only. */
export function getActiveProvider(): PaymentProvider | null {
  const provider = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (provider === "stripe" && process.env.STRIPE_SECRET_KEY) return "stripe";
  if (provider === "razorpay" && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return "razorpay";
  return null;
}

/** Returns true if an online payment gateway is configured and ready. */
export function isPaymentGatewayEnabled(): boolean {
  return getActiveProvider() !== null;
}

function stripeTestMode(): boolean {
  return !process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") && !process.env.STRIPE_SECRET_KEY?.startsWith("rk_live_");
}

function razorpayTestMode(): boolean {
  return !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_");
}

/** Returns the gateway config (safe for client — no secrets). */
export function getPaymentGatewayPublicConfig(): PaymentGatewayConfig | null {
  const provider = getActiveProvider();
  if (!provider) return null;

  if (provider === "stripe") {
    return {
      provider: "stripe",
      publicKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
      webhookSecret: "", // never expose
      currency: process.env.DEFAULT_CURRENCY ?? "USD",
      testMode: stripeTestMode(),
    };
  }

  return {
    provider: "razorpay",
    publicKey: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
    webhookSecret: "", // never expose
    currency: process.env.DEFAULT_CURRENCY ?? "INR",
    testMode: razorpayTestMode(),
  };
}

/** Webhook events each provider must be subscribed to (shown in admin + docs). */
export const REQUIRED_WEBHOOK_EVENTS: Record<"stripe" | "razorpay", string[]> = {
  stripe: [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "payment_intent.payment_failed",
    "charge.refunded",
  ],
  razorpay: ["payment_link.paid", "payment.failed", "refund.processed"],
};

export interface PaymentGatewayStatus {
  enabled: boolean;
  /** Raw PAYMENT_PROVIDER value (normalised), even when keys are missing. */
  requestedProvider: string | null;
  provider: "stripe" | "razorpay" | null;
  mode: "test" | "live" | null;
  secretKeyConfigured: boolean;
  publishableKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  defaultCurrency: string;
  webhookUrl: string;
  webhookEvents: string[];
  /** Human-readable configuration problems (no values). */
  issues: string[];
}

/** Read-only status for the admin settings page. Never includes secret values. */
export function getPaymentGatewayStatus(appUrl: string): PaymentGatewayStatus {
  const requested = process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || null;
  const provider = requested === "stripe" || requested === "razorpay" ? requested : null;
  const issues: string[] = [];

  let secretKeyConfigured = false;
  let publishableKeyConfigured = false;
  let webhookSecretConfigured = false;
  let mode: "test" | "live" | null = null;

  if (provider === "stripe") {
    secretKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
    publishableKeyConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
    webhookSecretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
    if (secretKeyConfigured) mode = stripeTestMode() ? "test" : "live";
    if (!secretKeyConfigured) issues.push("STRIPE_SECRET_KEY is missing");
    if (!webhookSecretConfigured) issues.push("STRIPE_WEBHOOK_SECRET is missing — webhooks will be rejected");
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    if (pk && mode && pk.startsWith(mode === "test" ? "pk_live_" : "pk_test_")) {
      issues.push("Publishable and secret keys are from different modes (test vs live)");
    }
  } else if (provider === "razorpay") {
    secretKeyConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    publishableKeyConfigured = Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);
    webhookSecretConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
    if (process.env.RAZORPAY_KEY_ID) mode = razorpayTestMode() ? "test" : "live";
    if (!process.env.RAZORPAY_KEY_ID) issues.push("RAZORPAY_KEY_ID is missing");
    if (!process.env.RAZORPAY_KEY_SECRET) issues.push("RAZORPAY_KEY_SECRET is missing");
    if (!webhookSecretConfigured) issues.push("RAZORPAY_WEBHOOK_SECRET is missing — webhooks will be rejected");
  } else if (requested && requested !== "manual") {
    issues.push(`Unknown PAYMENT_PROVIDER "${requested.slice(0, 20)}" (expected stripe or razorpay)`);
  }

  return {
    enabled: isPaymentGatewayEnabled(),
    requestedProvider: requested,
    provider,
    mode,
    secretKeyConfigured,
    publishableKeyConfigured,
    webhookSecretConfigured,
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? "AED",
    webhookUrl: `${appUrl.replace(/\/$/, "")}/api/payments/webhook`,
    webhookEvents: provider ? REQUIRED_WEBHOOK_EVENTS[provider] : [],
    issues,
  };
}

/** Returns the payment gateway instance. Throws if no gateway configured. */
export function getPaymentGateway(): PaymentGateway {
  const provider = getActiveProvider();
  if (_cachedGateway && _cachedFor === provider) return _cachedGateway;

  if (provider === "stripe") {
    _cachedGateway = new StripeGateway();
  } else if (provider === "razorpay") {
    _cachedGateway = new RazorpayGateway();
  } else {
    throw new Error(
      "No payment gateway configured. Set PAYMENT_PROVIDER and the corresponding API keys.",
    );
  }
  _cachedFor = provider;
  return _cachedGateway;
}

/** Gateway by name — the webhook route verifies with the provider that signed it. */
export function getGatewayFor(provider: "stripe" | "razorpay"): PaymentGateway {
  return provider === "stripe" ? new StripeGateway() : new RazorpayGateway();
}

/** Clears cached gateway (for testing). */
export function _resetGatewayCache(): void {
  _cachedGateway = null;
  _cachedFor = null;
}
