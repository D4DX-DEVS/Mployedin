"use client";

import { useCallback, useEffect, useRef } from "react";
import { normalizeReferralCode } from "@/lib/referrals/url";
import { getPendingReferral, setPendingReferral, stripRefFromAddressBarSoon } from "@/lib/referrals/pendingReferral";

/**
 * A job an agent shares from their Jobs page links to the public job with
 * `?ref=<their job-seeker code>`. A visitor who signs up by applying there is
 * credited to that agent exactly like a `/register?ref=` sign-up.
 *
 * Only a valid job-seeker code is kept (checked with /api/referral/validate,
 * as the register page does), and only in memory: nothing is written to a
 * cookie or to web storage when the visitor arrives. `ref` is also taken out of
 * the address bar once read. The code reaches a sign-up three ways: the getter
 * this hook returns (spread into signIn()), the header / footer / login
 * register links and OAuth starts (they read the same in-memory value), and from
 * there the register page's URL.
 */
export function useJobShareReferral(): () => { referralCode?: string } {
  const code = useRef("");
  // What the URL carried when the page opened. Read once and kept: the effect
  // below runs twice in React strict mode, and by the second run `ref` is
  // already gone from the address bar.
  const arrived = useRef<string | null>(null);

  useEffect(() => {
    if (arrived.current === null) {
      arrived.current = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    }
    // One tick later, after Next's router has patched history (Back button).
    stripRefFromAddressBarSoon();
    const ref = arrived.current;
    if (!ref) return;
    let cancelled = false;
    fetch(`/api/referral/validate?code=${encodeURIComponent(ref)}`)
      .then((res) => res.json())
      .then((data: { valid?: boolean; audience?: string }) => {
        if (cancelled || !data.valid || data.audience !== "job_seeker") return;
        code.current = ref;
        setPendingReferral(ref);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // A code seen earlier on this page load (another job page, the register page)
  // still counts when this page's own URL carried none.
  return useCallback(() => {
    const held = code.current || getPendingReferral();
    return held ? { referralCode: held } : {};
  }, []);
}
