import "server-only";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "./state";

export async function getConsent() {
  return parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
}
