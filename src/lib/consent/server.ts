import type { NextRequest } from "next/server";
import { CONSENT_COOKIE, type ConsentCategory, type ConsentState, isCategoryAllowed, parseConsent } from "./config";

/** Parse the visitor's consent cookie from a route-handler request. */
export function consentFromRequest(req: Pick<NextRequest, "cookies" | "headers">): ConsentState | null {
  return parseConsent(req.cookies.get(CONSENT_COOKIE)?.value);
}

/**
 * Server-side gate for anything that stores or reads non-essential data on the
 * device. Also treats the `Sec-GPC: 1` request header as an opt-out of
 * marketing, independently of the stored choice.
 */
export function requestAllows(req: Pick<NextRequest, "cookies" | "headers">, category: ConsentCategory): boolean {
  if (category === "marketing" && req.headers.get("sec-gpc") === "1") return false;
  return isCategoryAllowed(consentFromRequest(req), category);
}
