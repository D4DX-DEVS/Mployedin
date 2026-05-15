/**
 * Payment gateway factory — resolves the active gateway based on env config.
 *
 * Usage:
 *   const gateway = getPaymentGateway();
 *   const session = await gateway.createSession({ ... });
 *
 * Configuration:
 *   PAYMENT_PROVIDER=stripe|razorpay  (default: none — manual only)
 *   STRIPE_SECRET_KEY=sk_...
 *   RAZORPAY_KEY_ID=rzp_...
 */

import type { PaymentGateway, PaymentProvider, PaymentGatewayConfig } from "./types";
import { StripeGateway } from "./stripe";
import { RazorpayGateway } from "./razorpay";

let _cachedGateway: PaymentGateway | null = null;

/** Returns the configured payment provider or null if manual-only. */
export function getActiveProvider(): PaymentProvider | null {
  const provider = process.env.PAYMENT_PROVIDER as PaymentProvider | undefined;
  if (provider === "stripe" && process.env.STRIPE_SECRET_KEY) return "stripe";
  if (provider === "razorpay" && process.env.RAZORPAY_KEY_ID) return "razorpay";
  return null;
}

/** Returns true if an online payment gateway is configured and ready. */
export function isPaymentGatewayEnabled(): boolean {
  return getActiveProvider() !== null;
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
      testMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? true,
    };
  }

  if (provider === "razorpay") {
    return {
      provider: "razorpay",
      publicKey: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
      webhookSecret: "", // never expose
      currency: process.env.DEFAULT_CURRENCY ?? "INR",
      testMode: process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ?? true,
    };
  }

  return null;
}

/** Returns the payment gateway instance. Throws if no gateway configured. */
export function getPaymentGateway(): PaymentGateway {
  if (_cachedGateway) return _cachedGateway;

  const provider = getActiveProvider();

  if (provider === "stripe") {
    _cachedGateway = new StripeGateway();
    return _cachedGateway;
  }

  if (provider === "razorpay") {
    _cachedGateway = new RazorpayGateway();
    return _cachedGateway;
  }

  throw new Error(
    "No payment gateway configured. Set PAYMENT_PROVIDER and the corresponding API keys.",
  );
}

/** Clears cached gateway (for testing). */
export function _resetGatewayCache(): void {
  _cachedGateway = null;
}
