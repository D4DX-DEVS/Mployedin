"use client";

import Script, { type ScriptProps } from "next/script";
import { useConsent } from "@/hooks/useConsent";
import type { OptionalConsentCategory } from "@/lib/consent/config";

/**
 * Loads a third-party script only after the visitor opted in to its category,
 * so nothing non-essential runs or sets cookies before consent (ePrivacy art
 * 5(3)). Use this for every analytics / marketing / embed vendor, e.g.
 *
 *   <ConsentScript category="analytics" src="https://www.googletagmanager.com/gtag/js?id=G-XXX" />
 *
 * For Google tags also set Consent Mode v2 defaults to "denied" before the tag
 * loads; lib/consent/client.ts forwards every later choice via `gtag("consent", "update")`.
 * Remember to allow the vendor's origin in the CSP (lib/security/headers.ts).
 */
export function ConsentScript({ category, ...props }: ScriptProps & { category: OptionalConsentCategory }) {
  const allowed = useConsent(category);
  if (!allowed) return null;
  return <Script strategy="afterInteractive" {...props} />;
}

/** Renders children only when the category is allowed (e.g. a chat widget). */
export function ConsentGate({
  category,
  children,
  fallback = null,
}: {
  category: OptionalConsentCategory;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const allowed = useConsent(category);
  return <>{allowed ? children : fallback}</>;
}
