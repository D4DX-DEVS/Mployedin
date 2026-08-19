"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side leg of the 2FA enrollment gate (see (dashboard)/template.tsx).
 *
 * This exists because a server-side redirect() thrown from a shared segment
 * during a soft navigation lands in the client router cache and Next replays
 * it in a mount-effect loop — measured at ~50 identical RSC fetches per 15s
 * ("GET /en/admin/settings?setup2fa=1" storm, 1600+ requests per admin login).
 * A router.replace() from the client performs the same redirect exactly once.
 *
 * The template returns this INSTEAD of children, so no privileged content is
 * mounted while the redirect is in flight — only a neutral notice, so the page
 * is never a silent blank if the redirect is slow (or JS is disabled).
 */
export function TwoFactorSetupRedirect({ target }: { target: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium">Two-factor authentication required</p>
      <p className="text-sm text-muted-foreground">
        Taking you to security settings to set it up…{" "}
        <a href={target} className="underline">
          Continue
        </a>
      </p>
    </div>
  );
}
