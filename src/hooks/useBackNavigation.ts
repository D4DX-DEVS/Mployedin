"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Back navigation that cannot trap the user in a loop.
 *
 * A bare `router.back()` pops whatever the last history entry happens to be.
 * When the page you came from links here with a plain `<Link>` (a PUSH) and
 * this page links back with another `<Link>` (another PUSH), the stack grows
 * `[settings, notifications, settings]` and the next `back()` walks *forward*
 * into the sub-page again. Popping instead of pushing keeps the stack flat.
 *
 * Falls back to `fallbackHref` when there is nothing in-app to pop — a seeker
 * who opened the page straight from an email footer has no previous entry, and
 * `back()` would throw them out of the app.
 */
export function useBackNavigation(fallbackHref: string) {
  const router = useRouter();
  const [canPop, setCanPop] = useState(false);

  useEffect(() => {
    // `history.length` is 1 only for a tab whose first entry is this page.
    setCanPop(typeof window !== "undefined" && window.history.length > 1);
  }, []);

  const goBack = useCallback(() => {
    if (canPop) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [canPop, fallbackHref, router]);

  return { goBack, canPop, fallbackHref };
}
