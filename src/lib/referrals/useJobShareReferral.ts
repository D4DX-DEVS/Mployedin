"use client";

import { useCallback, useEffect, useRef } from "react";
import { REFERRAL_CODE_RE, REFERRAL_COOKIE_NAME } from "@/lib/referrals/url";

/**
 * A job an agent shares from their Jobs page links to the public job with
 * `?ref=<their job-seeker code>`. A visitor who signs up by applying there is
 * credited to that agent exactly like a `/register?ref=` sign-up.
 *
 * Only a valid job-seeker code is kept (checked with /api/referral/validate,
 * as the register page does). It is also dropped in the short-lived referral
 * cookie, so a visitor who leaves for /register or an OAuth redirect still
 * carries it. Returns the extra sign-in credentials to spread into signIn().
 */
export function useJobShareReferral(): () => { referralCode?: string } {
  const code = useRef("");

  useEffect(() => {
    const ref = (new URLSearchParams(window.location.search).get("ref") ?? "").trim().toUpperCase();
    if (!REFERRAL_CODE_RE.test(ref)) return;
    let cancelled = false;
    fetch(`/api/referral/validate?code=${encodeURIComponent(ref)}`)
      .then((res) => res.json())
      .then((data: { valid?: boolean; audience?: string }) => {
        if (cancelled || !data.valid || data.audience !== "job_seeker") return;
        code.current = ref;
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(ref)}; Max-Age=3600; Path=/; SameSite=Lax${secure}`;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return useCallback(() => (code.current ? { referralCode: code.current } : {}), []);
}
